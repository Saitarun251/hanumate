/**
 * Bead Commands - CLI command interface for Bead operations
 * 
 * Provides command handlers for bead CRUD operations and
 * dependency management.
 */

import {
	type Bead,
	type BeadStore,
	type BeadType,
	type BeadPriority,
	type BeadStatus,
	type BeadFilter,
	isValidBeadId,
	formatBead,
	sortByPriority,
} from './bead-types.js';

// ============================================================================
// Command Types
// ============================================================================

/**
 * Options for creating a bead
 */
export interface CreateBeadOptions {
	title: string;
	description?: string;
	type?: BeadType;
	priority?: BeadPriority;
	status?: BeadStatus;
	assignee?: string;
	tags?: string[];
	dependsOn?: string[];
	createdBy?: string;
}

/**
 * Options for updating a bead
 */
export interface UpdateBeadOptions {
	title?: string;
	description?: string;
	type?: BeadType;
	priority?: BeadPriority;
	status?: BeadStatus;
	assignee?: string;
	tags?: string[];
	addTags?: string[];
	removeTags?: string[];
}

/**
 * Options for listing beads
 */
export interface ListBeadsOptions {
	status?: BeadStatus;
	type?: BeadType;
	priority?: BeadPriority;
	assignee?: string;
	tags?: string[];
	search?: string;
	sort?: 'priority' | 'created' | 'updated';
	reverse?: boolean;
}

/**
 * Result of a bead command
 */
export interface BeadCommandResult<T = void> {
	success: boolean;
	data?: T;
	error?: string;
}

// ============================================================================
// Bead Commands Implementation
// ============================================================================

/**
 * Bead commands class - handles all bead-related CLI commands
 */
export class BeadCommands {
	private store: BeadStore;
	private defaultCreatedBy: string;
	
	constructor(store: BeadStore, defaultCreatedBy = 'cli') {
		this.store = store;
		this.defaultCreatedBy = defaultCreatedBy;
	}
	
	/**
	 * Create a new bead
	 */
	async create(options: CreateBeadOptions): Promise<BeadCommandResult<Bead>> {
		try {
			// Validate dependsOn
			if (options.dependsOn && options.dependsOn.length > 0) {
				for (const depId of options.dependsOn) {
					if (!isValidBeadId(depId)) {
						return {
							success: false,
							error: `Invalid bead ID format: ${depId}`,
						};
					}
					const dep = await this.store.get(depId);
					if (!dep) {
						return {
							success: false,
							error: `Dependency bead not found: ${depId}`,
						};
					}
				}
			}
			
			const bead = await this.store.create({
				title: options.title,
				description: options.description ?? '',
				type: options.type ?? 'task',
				priority: options.priority ?? 'P2',
				status: options.status ?? 'open',
				createdBy: options.createdBy ?? this.defaultCreatedBy,
				assignee: options.assignee,
				dependsOn: options.dependsOn,
				tags: options.tags,
			});
			
			return { success: true, data: bead };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Get a bead by ID
	 */
	async show(beadId: string): Promise<BeadCommandResult<Bead>> {
		try {
			if (!isValidBeadId(beadId)) {
				return {
					success: false,
					error: `Invalid bead ID format: ${beadId}`,
				};
			}
			
			const bead = await this.store.get(beadId);
			if (!bead) {
				return {
					success: false,
					error: `Bead not found: ${beadId}`,
				};
			}
			
			return { success: true, data: bead };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * List beads with optional filtering
	 */
	async list(options: ListBeadsOptions = {}): Promise<BeadCommandResult<Bead[]>> {
		try {
			const filter: BeadFilter = {};
			
			if (options.status) filter.status = options.status;
			if (options.type) filter.type = options.type;
			if (options.priority) filter.priority = options.priority;
			if (options.assignee) filter.assignee = options.assignee;
			if (options.tags) filter.tags = options.tags;
			if (options.search) filter.search = options.search;
			
			let beads = await this.store.list(filter);
			
			// Sort
			if (options.sort === 'priority') {
				beads = sortByPriority(beads);
			} else if (options.sort === 'created') {
				beads.sort((a, b) => options.reverse ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
			} else if (options.sort === 'updated') {
				beads.sort((a, b) => options.reverse ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt);
			}
			
			if (options.reverse) {
				beads = beads.reverse();
			}
			
			return { success: true, data: beads };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Update a bead
	 */
	async update(beadId: string, options: UpdateBeadOptions): Promise<BeadCommandResult<Bead>> {
		try {
			if (!isValidBeadId(beadId)) {
				return {
					success: false,
					error: `Invalid bead ID format: ${beadId}`,
				};
			}
			
			const existing = await this.store.get(beadId);
			if (!existing) {
				return {
					success: false,
					error: `Bead not found: ${beadId}`,
				};
			}
			
			const updates: Record<string, unknown> = {};
			if (options.title !== undefined) updates.title = options.title;
			if (options.description !== undefined) updates.description = options.description;
			if (options.type !== undefined) updates.type = options.type;
			if (options.priority !== undefined) updates.priority = options.priority;
			if (options.status !== undefined) updates.status = options.status;
			if (options.assignee !== undefined) updates.assignee = options.assignee;
			
			// Handle tags
			if (options.addTags && options.addTags.length > 0) {
				const existingTags = existing.tags ?? [];
				updates.tags = [...new Set([...existingTags, ...options.addTags])];
			}
			if (options.removeTags && options.removeTags.length > 0) {
				const currentTags = existing.tags ?? [];
				updates.tags = currentTags.filter(t => !options.removeTags!.includes(t));
			}
			if (options.tags !== undefined) {
				updates.tags = options.tags;
			}
			
			const bead = await this.store.update(beadId, updates);
			return { success: true, data: bead };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Close/done a bead
	 */
	async close(beadId: string): Promise<BeadCommandResult<Bead>> {
		return this.update(beadId, { status: 'done' });
	}
	
	/**
	 * Get ready beads (unblocked, not done)
	 */
	async ready(): Promise<BeadCommandResult<Bead[]>> {
		try {
			const beads = await this.store.ready();
			return { success: true, data: beads };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Add a dependency to a bead
	 */
	async addDep(beadId: string, dependsOnId: string): Promise<BeadCommandResult<Bead>> {
		try {
			if (!isValidBeadId(beadId) || !isValidBeadId(dependsOnId)) {
				return {
					success: false,
					error: 'Invalid bead ID format',
				};
			}
			
			const bead = await this.store.addDependency(beadId, dependsOnId);
			return { success: true, data: bead };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Remove a dependency from a bead
	 */
	async removeDep(beadId: string, dependsOnId: string): Promise<BeadCommandResult<Bead>> {
		try {
			if (!isValidBeadId(beadId) || !isValidBeadId(dependsOnId)) {
				return {
					success: false,
					error: 'Invalid bead ID format',
				};
			}
			
			const bead = await this.store.removeDependency(beadId, dependsOnId);
			return { success: true, data: bead };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Get beads that depend on a specific bead
	 */
	async dependents(beadId: string): Promise<BeadCommandResult<Bead[]>> {
		try {
			if (!isValidBeadId(beadId)) {
				return {
					success: false,
					error: `Invalid bead ID format: ${beadId}`,
				};
			}
			
			const dependents = await this.store.getDependents(beadId);
			return { success: true, data: dependents };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
	
	/**
	 * Delete a bead
	 */
	async delete(beadId: string): Promise<BeadCommandResult<void>> {
		try {
			if (!isValidBeadId(beadId)) {
				return {
					success: false,
					error: `Invalid bead ID format: ${beadId}`,
				};
			}
			
			const existing = await this.store.get(beadId);
			if (!existing) {
				return {
					success: false,
					error: `Bead not found: ${beadId}`,
				};
			}
			
			await this.store.delete(beadId);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}
}

// ============================================================================
// CLI Output Formatting
// ============================================================================

/**
 * Format a bead for CLI output
 */
export function formatBeadForCLI(bead: Bead, verbose = false): string {
	const lines: string[] = [];
	
	// Header
	lines.push(`${formatBead(bead)}`);
	
	if (verbose) {
		lines.push('');
		lines.push(`  ID:          ${bead.id}`);
		lines.push(`  Type:        ${bead.type}`);
		lines.push(`  Priority:    ${bead.priority}`);
		lines.push(`  Status:      ${bead.status}`);
		lines.push(`  Created by:  ${bead.createdBy}`);
		lines.push(`  Created:     ${new Date(bead.createdAt).toISOString()}`);
		lines.push(`  Updated:     ${new Date(bead.updatedAt).toISOString()}`);
		
		if (bead.assignee) {
			lines.push(`  Assignee:    ${bead.assignee}`);
		}
		
		if (bead.tags && bead.tags.length > 0) {
			lines.push(`  Tags:        ${bead.tags.join(', ')}`);
		}
		
		if (bead.dependsOn && bead.dependsOn.length > 0) {
			lines.push(`  Depends on:  ${bead.dependsOn.join(', ')}`);
		}
		
		lines.push('');
		lines.push('  Description:');
		const descLines = bead.description.split('\n');
		for (const line of descLines) {
			lines.push(`    ${line}`);
		}
	}
	
	return lines.join('\n');
}

/**
 * Format a list of beads for CLI output
 */
export function formatBeadList(beads: Bead[], showHeaders = true): string {
	if (beads.length === 0) {
		return 'No beads found';
	}
	
	const lines: string[] = [];
	
	if (showHeaders) {
		lines.push(`Found ${beads.length} bead(s):`);
		lines.push('');
	}
	
	for (const bead of beads) {
		lines.push(formatBead(bead));
	}
	
	return lines.join('\n');
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create bead commands with a store
 */
export function createBeadCommands(store: BeadStore, defaultCreatedBy?: string): BeadCommands {
	return new BeadCommands(store, defaultCreatedBy);
}