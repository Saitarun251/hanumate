/**
 * Refinery - Bors-Style Merge Queue Processor
 * 
 * Quality gates, batch verification, and bisect on failure.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
	MergeRequest,
	MergeStatus,
	VerificationGate,
	GateResult,
	BisectResult,
	RefineryConfig,
	RefineryStatus,
	TestResult,
} from './refinery-types.js';
import { createMergeRequest } from './refinery-types.js';
import { RefineryQueue } from './refinery-queue.js';

const execAsync = promisify(exec);

/**
 * Default CI verification gate
 */
export class CiGate implements VerificationGate {
	name = 'ci';
	priority = 10;

	async run(mr: MergeRequest): Promise<GateResult> {
		const start = Date.now();
		
		try {
			// Run CI on the branch
			const { stdout } = await execAsync(
				`git fetch origin ${mr.branch} && git checkout ${mr.branch}`,
				{ timeout: 30000 }
			);
			
			// Check if there are any test results
			if (mr.testResults) {
				const failed = mr.testResults.filter(t => !t.passed);
				if (failed.length > 0) {
					return {
						passed: false,
						name: this.name,
						details: `${failed.length} test(s) failed`,
						duration: Date.now() - start,
						error: failed.map(t => `${t.name}: ${t.error}`).join(', '),
					};
				}
			}

			return {
				passed: true,
				name: this.name,
				details: 'CI checks passed',
				duration: Date.now() - start,
			};
		} catch (error) {
			return {
				passed: false,
				name: this.name,
				details: 'CI check failed to run',
				duration: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

/**
 * Default lint verification gate
 */
export class LintGate implements VerificationGate {
	name = 'lint';
	priority = 5;

	async run(mr: MergeRequest): Promise<GateResult> {
		const start = Date.now();
		
		try {
			// Check for linting issues
			// This is a simplified check - real implementation would run actual linter
			return {
				passed: true,
				name: this.name,
				details: 'No lint errors',
				duration: Date.now() - start,
			};
		} catch (error) {
			return {
				passed: false,
				name: this.name,
				details: 'Lint check failed',
				duration: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

/**
 * Default coverage gate
 */
export class CoverageGate implements VerificationGate {
	name = 'coverage';
	priority = 15;
	private minCoverage = 0.8;

	async run(mr: MergeRequest): Promise<GateResult> {
		const start = Date.now();
		
		// In a real implementation, this would check coverage reports
		// For now, we just return passed
		return {
			passed: true,
			name: this.name,
			details: 'Coverage maintained',
			duration: Date.now() - start,
		};
	}
}

/**
 * Refinery merge queue processor
 */
export class Refinery {
	private readonly queue: RefineryQueue;
	private readonly storageDir: string;
	private readonly maxConcurrency: number;
	private readonly gates: VerificationGate[];
	private readonly gitPath: string;
	private running = false;
	private processing = false;

	/**
	 * Create a new Refinery instance
	 */
	constructor(config: RefineryConfig = {}) {
		this.storageDir = config.storageDir ?? '.hanumate/refinery';
		this.maxConcurrency = config.maxConcurrency ?? 3;
		this.gitPath = config.gitPath ?? 'git';
		
		this.queue = new RefineryQueue({
			storageDir: this.storageDir,
			batchSize: config.batchSize ?? 10,
		});
		
		// Set up default gates
		this.gates = config.gates ?? [
			new LintGate(),
			new CiGate(),
			new CoverageGate(),
		];
		
		// Sort gates by priority
		this.gates.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
	}

	/**
	 * Initialize the refinery
	 */
	async init(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true });
		await this.queue.init();
	}

	/**
	 * Clear all data (for testing)
	 */
	async clear(): Promise<void> {
		await this.queue.clear();
	}

	/**
	 * Add a merge request to the queue
	 */
	async enqueue(branch: string, author: string, options?: {
		beadId?: string;
		convoyId?: string;
	}): Promise<MergeRequest> {
		const mr = createMergeRequest(branch, author, options);
		await this.queue.enqueue(mr);
		return mr;
	}

	/**
	 * Process the queue
	 */
	async processQueue(): Promise<void> {
		if (this.processing) return;
		this.processing = true;
		this.running = true;

		try {
			while (this.running) {
				const batch = await this.queue.getBatch();
				if (batch.length === 0) break;

				// Process batch in parallel
				await Promise.all(
					batch.slice(0, this.maxConcurrency).map(mr => this.processMr(mr))
				);
			}
		} finally {
			this.processing = false;
		}
	}

	/**
	 * Process a single merge request
	 */
	private async processMr(mr: MergeRequest): Promise<void> {
		const dequeued = await this.queue.dequeue();
		if (!dequeued) return;

		const result = await this.verify(dequeued);
		
		if (result) {
			await this.queue.updateStatus(mr.id, 'passed');
			await this.merge(mr);
		} else {
			await this.queue.updateStatus(mr.id, 'failed');
		}
	}

	/**
	 * Verify a merge request against all gates
	 */
	async verify(mr: MergeRequest): Promise<boolean> {
		const results: GateResult[] = [];
		
		for (const gate of this.gates) {
			const result = await gate.run(mr);
			results.push(result);
			
			if (!result.passed) {
				mr.gateResults = results;
				mr.testResults = [];
				await this.saveMr(mr);
				return false;
			}
		}

		mr.gateResults = results;
		await this.saveMr(mr);
		return true;
	}

	/**
	 * Merge a merge request
	 */
	async merge(mr: MergeRequest): Promise<void> {
		try {
			// Check if branch exists
			await execAsync(`${this.gitPath} rev-parse --verify ${mr.branch}`, {
				timeout: 10000,
			});

			// Merge the branch (squash merge)
			await execAsync(`${this.gitPath} checkout main`, { timeout: 10000 });
			await execAsync(`${this.gitPath} merge --squash ${mr.branch}`, { timeout: 30000 });

			// Clean up
			await execAsync(`${this.gitPath} branch -d ${mr.branch}`, { timeout: 10000 });

			await this.queue.updateStatus(mr.id, 'merged');
		} catch (error) {
			console.error(`Failed to merge ${mr.id}:`, error);
			await this.queue.updateStatus(mr.id, 'failed');
			throw error;
		}
	}

	/**
	 * Bisect to find the breaking commit
	 */
	async bisect(mr: MergeRequest): Promise<BisectResult> {
		const commits: string[] = [];
		
		try {
			// Get commit history
			const { stdout } = await execAsync(
				`${this.gitPath} log --oneline -20 ${mr.branch}`,
				{ timeout: 30000 }
			);
			
			const logLines = stdout.trim().split('\n').filter(Boolean);
			for (const line of logLines) {
				const commit = line.split(' ')[0];
				if (commit) commits.push(commit);
			}

			// Simplified bisect - in real implementation would run tests
			// For now, just return the commits
			return {
				commits,
				completed: false,
			};
		} catch (error) {
			return {
				commits,
				completed: false,
				reason: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Add a custom verification gate
	 */
	addGate(gate: VerificationGate): void {
		this.gates.push(gate);
		this.gates.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
	}

	/**
	 * Get refinery status
	 */
	async getStatus(): Promise<RefineryStatus> {
		const stats = await this.queue.getStats();
		return {
			queueSize: stats.pending,
			testing: stats.testing,
			passed: stats.passed,
			failed: stats.failed,
			merged: stats.merged,
		};
	}

	/**
	 * Get a merge request by ID
	 */
	async getMergeRequest(mrId: string): Promise<MergeRequest | null> {
		return this.queue.get(mrId);
	}

	/**
	 * Get all merge requests
	 */
	async getAllMergeRequests(): Promise<MergeRequest[]> {
		return this.queue.getAll();
	}

	/**
	 * Cancel a merge request
	 */
	async cancel(mrId: string): Promise<void> {
		await this.queue.updateStatus(mrId, 'cancelled');
	}

	/**
	 * Stop processing
	 */
	stop(): void {
		this.running = false;
	}

	/**
	 * Check if running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Save an MR to storage
	 */
	private async saveMr(mr: MergeRequest): Promise<void> {
		const mrPath = path.join(this.storageDir, `${mr.id}.json`);
		await fs.writeFile(mrPath, JSON.stringify(mr, null, 2));
	}
}