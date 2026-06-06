/**
 * Refinery Queue - Merge Request Queue Management
 * 
 * FIFO queue with status tracking and batch processing.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
	MergeRequest,
	MergeStatus,
	QueueOptions,
	MergeRequestId,
} from './refinery-types.js';
import { generateMergeRequestId } from './refinery-types.js';

/**
 * Refinery queue for managing merge requests
 */
export class RefineryQueue {
	private readonly storageDir: string;
	private readonly batchSize: number;
	private queue: MergeRequest[] = [];
	private byId: Map<MergeRequestId, MergeRequest> = new Map();
	private nextSequence = 0;

	/**
	 * Create a new queue
	 */
	constructor(options: QueueOptions = {}) {
		this.storageDir = options.storageDir ?? '.hanumate/refinery';
		this.batchSize = options.batchSize ?? 10;
	}

	/**
	 * Initialize the queue (load from storage)
	 */
	async init(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true });
		await this.load();
	}

	/**
	 * Clear all data (for testing)
	 */
	async clear(): Promise<void> {
		this.queue = [];
		this.byId = new Map();
		this.nextSequence = 0;
		try {
			await fs.unlink(path.join(this.storageDir, 'queue.json'));
		} catch {
			// File might not exist
		}
	}

	/**
	 * Load queue from storage
	 */
	private async load(): Promise<void> {
		try {
			const indexPath = path.join(this.storageDir, 'queue.json');
			const data = await fs.readFile(indexPath, 'utf-8');
			const saved = JSON.parse(data);
			this.queue = saved.queue ?? [];
			this.byId = new Map(this.queue.map(mr => [mr.id, mr]));
			this.nextSequence = saved.nextSequence ?? 0;
		} catch {
			// No saved queue, start fresh
			this.queue = [];
			this.byId = new Map();
			this.nextSequence = 0;
		}
	}

	/**
	 * Save queue to storage
	 */
	private async save(): Promise<void> {
		const indexPath = path.join(this.storageDir, 'queue.json');
		await fs.writeFile(indexPath, JSON.stringify({
			queue: this.queue,
			nextSequence: this.nextSequence,
		}, null, 2));
	}

	/**
	 * Get next sequence number
	 */
	private getNextSequence(): number {
		return this.nextSequence++;
	}

	/**
	 * Add a merge request to the queue
	 */
	async enqueue(mr: MergeRequest): Promise<void> {
		// Assign ID if not set
		if (!mr.id) {
			mr.id = generateMergeRequestId();
		}
		
		mr.status = 'pending';
		mr.createdAt = mr.createdAt ?? Date.now();
		mr.updatedAt = Date.now();
		
		this.queue.push(mr);
		this.byId.set(mr.id, mr);
		await this.save();
	}

	/**
	 * Get and remove the next MR from the queue
	 */
	async dequeue(): Promise<MergeRequest | null> {
		if (this.queue.length === 0) {
			return null;
		}

		const mr = this.queue.shift()!;
		mr.status = 'testing';
		mr.updatedAt = Date.now();
		
		// Save individual MR file
		await this.saveMrFile(mr);
		await this.save();
		
		return mr;
	}

	/**
	 * Peek at the next MR without removing it
	 */
	async peek(): Promise<MergeRequest | null> {
		return this.queue[0] ?? null;
	}

	/**
	 * Get the number of MRs in the queue
	 */
	async size(): Promise<number> {
		return this.queue.length;
	}

	/**
	 * Update the status of a merge request
	 */
	async updateStatus(mrId: string, status: MergeStatus): Promise<void> {
		const mr = this.byId.get(mrId);
		if (!mr) {
			throw new Error(`Merge request ${mrId} not found`);
		}

		mr.status = status;
		mr.updatedAt = Date.now();
		
		await this.saveMrFile(mr);
		await this.save();
	}

	/**
	 * Get all pending merge requests
	 */
	async getPending(): Promise<MergeRequest[]> {
		return this.queue.filter(mr => mr.status === 'pending');
	}

	/**
	 * Get MRs by status
	 */
	async getByStatus(status: MergeStatus): Promise<MergeRequest[]> {
		return Array.from(this.byId.values()).filter(mr => mr.status === status);
	}

	/**
	 * Get a merge request by ID
	 */
	async get(mrId: string): Promise<MergeRequest | null> {
		return this.byId.get(mrId) ?? null;
	}

	/**
	 * Get all merge requests
	 */
	async getAll(): Promise<MergeRequest[]> {
		return Array.from(this.byId.values()).sort((a, b) => a.createdAt - b.createdAt);
	}

	/**
	 * Remove a merge request from the queue
	 */
	async remove(mrId: string): Promise<void> {
		const mr = this.byId.get(mrId);
		if (!mr) return;

		this.queue = this.queue.filter(m => m.id !== mrId);
		this.byId.delete(mrId);
		
		// Try to remove the file
		try {
			const mrPath = path.join(this.storageDir, `${mrId}.json`);
			await fs.unlink(mrPath);
		} catch {
			// File might not exist
		}
		
		await this.save();
	}

	/**
	 * Save an MR to its own file
	 */
	private async saveMrFile(mr: MergeRequest): Promise<void> {
		const mrPath = path.join(this.storageDir, `${mr.id}.json`);
		await fs.writeFile(mrPath, JSON.stringify(mr, null, 2));
	}

	/**
	 * Get the next batch of MRs to process
	 */
	async getBatch(): Promise<MergeRequest[]> {
		const batch: MergeRequest[] = [];
		for (let i = 0; i < this.batchSize && i < this.queue.length; i++) {
			const mr = this.queue[i];
			if (mr.status === 'pending') {
				batch.push(mr);
			}
		}
		return batch;
	}

	/**
	 * Get queue statistics
	 */
	async getStats(): Promise<{
		pending: number;
		testing: number;
		passed: number;
		failed: number;
		merged: number;
		total: number;
	}> {
		const all = Array.from(this.byId.values());
		return {
			pending: all.filter(mr => mr.status === 'pending').length,
			testing: all.filter(mr => mr.status === 'testing').length,
			passed: all.filter(mr => mr.status === 'passed').length,
			failed: all.filter(mr => mr.status === 'failed').length,
			merged: all.filter(mr => mr.status === 'merged').length,
			total: all.length,
		};
	}
}