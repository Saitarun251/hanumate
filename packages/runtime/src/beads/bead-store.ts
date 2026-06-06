/**
 * Bead Store - JSON-based persistence layer for Beads
 * 
 * Stores bead data as JSON files in .rubberduck/beads/ directory.
 * Each bead is stored as a separate JSON file named {beadId}.json
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import {
	type Bead,
	type BeadStore,
	type CreateBeadInput,
	type UpdateBeadInput,
	type BeadFilter,
	generateBeadId,
	isBlocked,
} from './bead-types.js';

// ============================================================================
// Constants
// ============================================================================

const BEADS_DIR = '.rubberduck/beads';

/**
 * Callback type for bead assignment events
 */
export type BeadAssignCallback = (beadId: string, agentId: string) => void;

/**
 * Callback type for bead status change events
 */
export type BeadStatusChangeCallback = (beadId: string, oldStatus: string, newStatus: string) => void;

/**
 * Default configuration for the bead store
 */
export interface BeadStoreConfig {
	/** Base directory for storing beads (defaults to .rubberduck/beads) */
	baseDir?: string;
	
	/** Enable automatic git commits on changes */
	autoGitCommit?: boolean;
	
	/** Git commit message template */
	gitCommitTemplate?: string;
	
	/** Optional callback when a bead is assigned to an agent */
	onAssign?: BeadAssignCallback;
	
	/** Optional callback when a bead's status changes */
	onStatusChange?: BeadStatusChangeCallback;
}

// ============================================================================
// JSON File Bead Store Implementation
// ============================================================================

/**
 * JSON file-based bead store implementation
 * 
 * Stores each bead as a separate JSON file in the configured directory.
 * Optionally supports automatic git commits.
 */
export class JsonBeadStore implements BeadStore {
	private readonly baseDir: string;
	private readonly autoGitCommit: boolean;
	private readonly gitCommitTemplate: string;
	private readonly onAssign?: BeadAssignCallback;
	private readonly onStatusChange?: BeadStatusChangeCallback;
	private beads: Map<string, Bead> = new Map();
	private initialized = false;
	
	constructor(config?: BeadStoreConfig) {
		this.baseDir = config?.baseDir ?? BEADS_DIR;
		this.autoGitCommit = config?.autoGitCommit ?? false;
		this.gitCommitTemplate = config?.gitCommitTemplate ?? 'bead: update {beadId}';
		this.onAssign = config?.onAssign;
		this.onStatusChange = config?.onStatusChange;
	}
	
	/**
	 * Ensure the beads directory exists
	 */
	private async ensureDir(): Promise<void> {
		try {
			await fs.mkdir(this.baseDir, { recursive: true });
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
		}
	}
	
	/**
	 * Get the file path for a bead
	 */
	private getFilePath(beadId: string): string {
		return join(this.baseDir, `${beadId}.json`);
	}
	
	/**
	 * Initialize the store by loading all existing beads
	 */
	private async init(): Promise<void> {
		if (this.initialized) return;
		
		await this.ensureDir();
		
		try {
			const files = await fs.readdir(this.baseDir);
			const beadFiles = files.filter(f => f.endsWith('.json'));
			
			for (const file of beadFiles) {
				const filePath = join(this.baseDir, file);
				const content = await fs.readFile(filePath, 'utf-8');
				const bead = JSON.parse(content) as Bead;
				this.beads.set(bead.id, bead);
			}
			
			this.initialized = true;
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				this.initialized = true;
				return;
			}
			throw error;
		}
	}
	
	/**
	 * Save a bead to disk
	 */
	private async saveBead(bead: Bead): Promise<void> {
		await this.ensureDir();
		const filePath = this.getFilePath(bead.id);
		const content = JSON.stringify(bead, null, 2);
		
		// Atomic write: write to temp file first, then rename
		const tempPath = `${filePath}.tmp`;
		await fs.writeFile(tempPath, content, 'utf-8');
		await fs.rename(tempPath, filePath);
		
		// Optionally commit to git
		if (this.autoGitCommit) {
			await this.commitToGit(bead);
		}
	}
	
	/**
	 * Delete a bead file from disk
	 */
	private async deleteBeadFile(beadId: string): Promise<void> {
		const filePath = this.getFilePath(beadId);
		try {
			await fs.unlink(filePath);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
	}
	
	/**
	 * Commit bead changes to git (optional feature)
	 * Uses child_process directly to avoid import issues
	 */
	private async commitToGit(bead: Bead): Promise<void> {
		try {
			const { spawn } = await import('node:child_process');
			const { relative } = await import('node:path');
			
			// Get relative path from current working directory
			const absolutePath = this.getFilePath(bead.id);
			const relativePathToFile = relative(process.cwd(), absolutePath);
			
			// Stage the file - use spawn for better control
			const addProcess = spawn('/bin/sh', ['-c', `git add "${relativePathToFile}"`], {
				stdio: 'ignore',
			});
			
			await new Promise<void>((resolve) => {
				addProcess.on('close', () => resolve());
			});
			
			// Create commit with template
			const message = this.gitCommitTemplate.replace('{beadId}', bead.id);
			const commitProcess = spawn('/bin/sh', ['-c', `git commit -m "${message}"`], {
				stdio: 'ignore',
			});
			
			await new Promise<void>((resolve) => {
				commitProcess.on('close', () => resolve());
			});
		} catch {
			// Git commit failed - continue without failing
			console.warn(`Failed to commit bead ${bead.id} to git`);
		}
	}
	
	/**
	 * Check if a bead ID is already in use
	 */
	private async isIdUnique(beadId: string): Promise<boolean> {
		await this.init();
		return !this.beads.has(beadId);
	}
	
	/**
	 * Generate a unique bead ID
	 */
	private async generateUniqueId(): Promise<string> {
		let attempts = 0;
		const maxAttempts = 100;
		
		while (attempts < maxAttempts) {
			const id = generateBeadId();
			if (await this.isIdUnique(id)) {
				return id;
			}
			attempts++;
		}
		
		throw new Error('Failed to generate unique bead ID');
	}
	
	/**
	 * Create a new bead
	 */
	async create(input: CreateBeadInput): Promise<Bead> {
		await this.init();
		
		const now = Date.now();
		const id = await this.generateUniqueId();
		
		const bead: Bead = {
			...input,
			id,
			createdAt: now,
			updatedAt: now,
		};
		
		this.beads.set(id, bead);
		await this.saveBead(bead);
		
		return bead;
	}
	
	/**
	 * Get a bead by ID
	 */
	async get(beadId: string): Promise<Bead | null> {
		await this.init();
		return this.beads.get(beadId) ?? null;
	}
	
	/**
	 * Update an existing bead
	 */
	async update(beadId: string, updates: UpdateBeadInput): Promise<Bead> {
		await this.init();
		
		const existing = this.beads.get(beadId);
		if (!existing) {
			throw new Error(`Bead not found: ${beadId}`);
		}
		
		const updated: Bead = {
			...existing,
			...updates,
			id: beadId, // Prevent ID changes
			createdAt: existing.createdAt, // Prevent createdAt changes
			updatedAt: Date.now(),
		};
		
		// Notify status change callback
		if (this.onStatusChange && updates.status && updates.status !== existing.status) {
			this.onStatusChange(beadId, existing.status, updates.status);
		}
		
		// Notify assign callback (when assignee changes)
		if (this.onAssign && updates.assignee && updates.assignee !== existing.assignee) {
			this.onAssign(beadId, updates.assignee);
		}
		
		this.beads.set(beadId, updated);
		await this.saveBead(updated);
		
		return updated;
	}
	
	/**
	 * Delete a bead
	 */
	async delete(beadId: string): Promise<void> {
		await this.init();
		
		if (!this.beads.has(beadId)) {
			throw new Error(`Bead not found: ${beadId}`);
		}
		
		this.beads.delete(beadId);
		await this.deleteBeadFile(beadId);
	}
	
	/**
	 * List beads with optional filtering
	 */
	async list(filter?: BeadFilter): Promise<Bead[]> {
		await this.init();
		
		let beads = Array.from(this.beads.values());
		
		if (filter) {
			if (filter.status) {
				beads = beads.filter(b => b.status === filter.status);
			}
			if (filter.type) {
				beads = beads.filter(b => b.type === filter.type);
			}
			if (filter.priority) {
				beads = beads.filter(b => b.priority === filter.priority);
			}
			if (filter.assignee) {
				beads = beads.filter(b => b.assignee === filter.assignee);
			}
			if (filter.createdBy) {
				beads = beads.filter(b => b.createdBy === filter.createdBy);
			}
			if (filter.tags && filter.tags.length > 0) {
				beads = beads.filter(b => 
					b.tags && filter.tags!.some(t => b.tags!.includes(t))
				);
			}
			if (filter.search) {
				const search = filter.search.toLowerCase();
				beads = beads.filter(b => 
					b.title.toLowerCase().includes(search) ||
					b.description.toLowerCase().includes(search)
				);
			}
		}
		
		// Sort by creation time (newest first)
		return beads.sort((a, b) => b.createdAt - a.createdAt);
	}
	
	/**
	 * Get beads that are ready to work (unblocked, not done)
	 */
	async ready(): Promise<Bead[]> {
		await this.init();
		
		const beads = Array.from(this.beads.values());
		const beadsMap = new Map(beads.map(b => [b.id, b]));
		
		// Filter beads that are:
		// 1. Not done
		// 2. Not blocked (all dependencies are done)
		return beads
			.filter(b => b.status !== 'done')
			.filter(b => !isBlocked(b, beadsMap))
			.sort((a, b) => {
				// Sort by priority (P0 first)
				const priorityOrder = ['P0', 'P1', 'P2', 'P3', 'P4'];
				return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
			});
	}
	
	/**
	 * Add a dependency to a bead
	 */
	async addDependency(beadId: string, dependsOnId: string): Promise<Bead> {
		await this.init();
		
		const bead = this.beads.get(beadId);
		if (!bead) {
			throw new Error(`Bead not found: ${beadId}`);
		}
		
		// Verify the dependency exists
		const depBead = this.beads.get(dependsOnId);
		if (!depBead) {
			throw new Error(`Dependency bead not found: ${dependsOnId}`);
		}
		
		// Prevent self-dependency
		if (beadId === dependsOnId) {
			throw new Error('A bead cannot depend on itself');
		}
		
		// Add dependency if not already present
		const dependsOn = bead.dependsOn ?? [];
		if (!dependsOn.includes(dependsOnId)) {
			return this.update(beadId, { dependsOn: [...dependsOn, dependsOnId] });
		}
		
		return bead;
	}
	
	/**
	 * Remove a dependency from a bead
	 */
	async removeDependency(beadId: string, dependsOnId: string): Promise<Bead> {
		await this.init();
		
		const bead = this.beads.get(beadId);
		if (!bead) {
			throw new Error(`Bead not found: ${beadId}`);
		}
		
		const dependsOn = bead.dependsOn ?? [];
		const filtered = dependsOn.filter(id => id !== dependsOnId);
		
		return this.update(beadId, { dependsOn: filtered.length > 0 ? filtered : undefined });
	}
	
	/**
	 * Get beads that depend on a specific bead
	 */
	async getDependents(beadId: string): Promise<Bead[]> {
		await this.init();
		
		return Array.from(this.beads.values()).filter(b => 
			b.dependsOn && b.dependsOn.includes(beadId)
		);
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a bead store with JSON file persistence
 * 
 * @param config - Optional configuration
 * @returns JsonBeadStore instance
 */
export function createBeadStore(config?: BeadStoreConfig): BeadStore {
	return new JsonBeadStore(config);
}

/**
 * Create an in-memory bead store for testing
 * @param config - Optional configuration with callbacks
 */
export function createInMemoryBeadStore(config?: {
	onAssign?: BeadAssignCallback;
	onStatusChange?: BeadStatusChangeCallback;
}): BeadStore {
	const beads = new Map<string, Bead>();
	const onAssign = config?.onAssign;
	const onStatusChange = config?.onStatusChange;
	
	return {
		async create(input: CreateBeadInput): Promise<Bead> {
			const now = Date.now();
			const id = generateBeadId();
			const bead: Bead = { ...input, id, createdAt: now, updatedAt: now };
			beads.set(id, bead);
			return bead;
		},
		
		async get(beadId: string): Promise<Bead | null> {
			return beads.get(beadId) ?? null;
		},
		
		async update(beadId: string, updates: UpdateBeadInput): Promise<Bead> {
			const existing = beads.get(beadId);
			if (!existing) {
				throw new Error(`Bead not found: ${beadId}`);
			}
			const updated: Bead = {
				...existing,
				...updates,
				id: beadId,
				createdAt: existing.createdAt,
				updatedAt: Date.now(),
			};
			
			// Notify status change callback
			if (onStatusChange && updates.status && updates.status !== existing.status) {
				onStatusChange(beadId, existing.status, updates.status);
			}
			
			// Notify assign callback (when assignee changes)
			if (onAssign && updates.assignee && updates.assignee !== existing.assignee) {
				onAssign(beadId, updates.assignee);
			}
			
			beads.set(beadId, updated);
			return updated;
		},
		
		async delete(beadId: string): Promise<void> {
			if (!beads.has(beadId)) {
				throw new Error(`Bead not found: ${beadId}`);
			}
			beads.delete(beadId);
		},
		
		async list(filter?: BeadFilter): Promise<Bead[]> {
			let result = Array.from(beads.values());
			
			if (filter) {
				if (filter.status) {
					result = result.filter(b => b.status === filter.status);
				}
				if (filter.type) {
					result = result.filter(b => b.type === filter.type);
				}
				if (filter.priority) {
					result = result.filter(b => b.priority === filter.priority);
				}
				if (filter.assignee) {
					result = result.filter(b => b.assignee === filter.assignee);
				}
				if (filter.createdBy) {
					result = result.filter(b => b.createdBy === filter.createdBy);
				}
				if (filter.tags && filter.tags.length > 0) {
					result = result.filter(b => 
						b.tags && filter.tags!.some(t => b.tags!.includes(t))
					);
				}
				if (filter.search) {
					const search = filter.search.toLowerCase();
					result = result.filter(b => 
						b.title.toLowerCase().includes(search) ||
						b.description.toLowerCase().includes(search)
					);
				}
			}
			
			return result.sort((a, b) => b.createdAt - a.createdAt);
		},
		
		async ready(): Promise<Bead[]> {
			const allBeads = Array.from(beads.values());
			return allBeads
				.filter(b => b.status !== 'done')
				.filter(b => !isBlocked(b, beads))
				.sort((a, b) => {
					const priorityOrder = ['P0', 'P1', 'P2', 'P3', 'P4'];
					return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
				});
		},
		
		async addDependency(beadId: string, dependsOnId: string): Promise<Bead> {
			const bead = beads.get(beadId);
			if (!bead) throw new Error(`Bead not found: ${beadId}`);
			
			// Verify the dependency exists
			const depBead = beads.get(dependsOnId);
			if (!depBead) {
				throw new Error(`Dependency bead not found: ${dependsOnId}`);
			}
			
			// Prevent self-dependency
			if (beadId === dependsOnId) {
				throw new Error('A bead cannot depend on itself');
			}
			
			const dependsOn = bead.dependsOn ?? [];
			if (!dependsOn.includes(dependsOnId)) {
				dependsOn.push(dependsOnId);
			}
			return this.update(beadId, { dependsOn });
		},
		
		async removeDependency(beadId: string, dependsOnId: string): Promise<Bead> {
			const bead = beads.get(beadId);
			if (!bead) throw new Error(`Bead not found: ${beadId}`);
			const dependsOn = (bead.dependsOn ?? []).filter(id => id !== dependsOnId);
			return this.update(beadId, { dependsOn: dependsOn.length > 0 ? dependsOn : undefined });
		},
		
		async getDependents(beadId: string): Promise<Bead[]> {
			return Array.from(beads.values()).filter(b => 
				b.dependsOn && b.dependsOn.includes(beadId)
			);
		},
	};
}