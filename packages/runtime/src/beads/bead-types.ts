/**
 * Bead Types - Type definitions for git-backed issue tracking
 * 
 * Beads are lightweight work units that are persisted to disk
 * and optionally committed to git for version control.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Bead types representing different kinds of work items
 */
export type BeadType = 'task' | 'bug' | 'feature' | 'epic' | 'question' | 'docs';

/**
 * Bead priority levels (P0 = highest)
 */
export type BeadPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Bead status states
 */
export type BeadStatus = 'open' | 'in_progress' | 'done' | 'blocked';

/**
 * Core Bead interface representing a work unit
 */
export interface Bead {
	/** 
	 * Unique identifier in format: rd-xxxxx (5 char alphanumeric)
	 * Auto-generated on creation
	 */
	id: string;
	
	/** Short title describing the work */
	title: string;
	
	/** Detailed description of the work */
	description: string;
	
	/** Type of work item */
	type: BeadType;
	
	/** Priority level */
	priority: BeadPriority;
	
	/** Current status */
	status: BeadStatus;
	
	/** Agent ID that created this bead */
	createdBy: string;
	
	/** Unix timestamp when created */
	createdAt: number;
	
	/** Unix timestamp when last updated */
	updatedAt: number;
	
	/** Agent ID assigned to this bead (optional) */
	assignee?: string;
	
	/** Array of Bead IDs this bead depends on */
	dependsOn?: string[];
	
	/** Optional tags for categorization */
	tags?: string[];
	
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Input type for creating a new bead (without auto-generated fields)
 */
export type CreateBeadInput = Omit<Bead, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Partial update type for modifying an existing bead
 */
export type UpdateBeadInput = Partial<Omit<Bead, 'id' | 'createdAt'>>;

/**
 * Filter options for listing beads
 */
export interface BeadFilter {
	status?: BeadStatus;
	type?: BeadType;
	priority?: BeadPriority;
	assignee?: string;
	createdBy?: string;
	tags?: string[];
	search?: string;
}

/**
 * Bead store interface - must be implemented by all backends
 */
export interface BeadStore {
	/**
	 * Create a new bead
	 * @param input - Bead data without id/timestamps
	 * @returns Created bead with auto-generated id and timestamps
	 */
	create(input: CreateBeadInput): Promise<Bead>;
	
	/**
	 * Get a bead by ID
	 * @param beadId - Bead ID (format: rd-xxxxx)
	 * @returns Bead or null if not found
	 */
	get(beadId: string): Promise<Bead | null>;
	
	/**
	 * Update an existing bead
	 * @param beadId - Bead ID to update
	 * @param updates - Partial bead data to update
	 * @returns Updated bead
	 * @throws Error if bead not found
	 */
	update(beadId: string, updates: UpdateBeadInput): Promise<Bead>;
	
	/**
	 * Delete a bead
	 * @param beadId - Bead ID to delete
	 */
	delete(beadId: string): Promise<void>;
	
	/**
	 * List beads with optional filtering
	 * @param filter - Optional filter criteria
	 * @returns Array of matching beads
	 */
	list(filter?: BeadFilter): Promise<Bead[]>;
	
	/**
	 * Get beads that are ready to work (unblocked)
	 * @returns Array of ready beads
	 */
	ready(): Promise<Bead[]>;
	
	/**
	 * Add a dependency to a bead
	 * @param beadId - Bead that will depend on another
	 * @param dependsOnId - Bead ID that beadId depends on
	 */
	addDependency(beadId: string, dependsOnId: string): Promise<Bead>;
	
	/**
	 * Remove a dependency from a bead
	 * @param beadId - Bead to modify
	 * @param dependsOnId - Dependency to remove
	 */
	removeDependency(beadId: string, dependsOnId: string): Promise<Bead>;
	
	/**
	 * Get beads that depend on a specific bead
	 * @param beadId - Bead ID to check
	 * @returns Array of beads that depend on beadId
	 */
	getDependents(beadId: string): Promise<Bead[]>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique bead ID
 * Format: rd-xxxxx (5 alphanumeric characters)
 */
export function generateBeadId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'rd-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Validate a bead ID format
 * @param id - ID to validate
 * @returns true if valid format
 */
export function isValidBeadId(id: string): boolean {
	// Only lowercase rd- prefix is valid
	return /^rd-[a-z0-9]{5}$/.test(id);
}

/**
 * Get the default bead status based on type
 * @param type - Bead type
 * @returns Default status
 */
export function getDefaultStatus(type: BeadType): BeadStatus {
	return 'open';
}

/**
 * Check if a bead is blocked by dependencies
 * @param bead - Bead to check
 * @param allBeads - Map of all beads for lookup
 * @returns true if blocked
 */
export function isBlocked(bead: Bead, allBeads: Map<string, Bead>): boolean {
	if (!bead.dependsOn || bead.dependsOn.length === 0) {
		return false;
	}
	
	for (const depId of bead.dependsOn) {
		const dep = allBeads.get(depId);
		if (!dep) {
			// Dependency doesn't exist - not blocked
			continue;
		}
		if (dep.status !== 'done') {
			return true;
		}
	}
	
	return false;
}

/**
 * Sort beads by priority
 * @param beads - Array of beads to sort
 * @returns Sorted array (P0 first)
 */
export function sortByPriority(beads: Bead[]): Bead[] {
	const priorityOrder: Record<BeadPriority, number> = {
		'P0': 0,
		'P1': 1,
		'P2': 2,
		'P3': 3,
		'P4': 4,
	};
	
	return [...beads].sort((a, b) => {
		const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
		if (priorityDiff !== 0) return priorityDiff;
		
		// Secondary sort by creation time (older first)
		return a.createdAt - b.createdAt;
	});
}

/**
 * Format a bead for display
 * @param bead - Bead to format
 * @returns Formatted string
 */
export function formatBead(bead: Bead): string {
	const statusEmoji = {
		'open': '⚪',
		'in_progress': '🔵',
		'done': '✅',
		'blocked': '🔴',
	};
	
	const typeIcon = {
		'task': '📋',
		'bug': '🐛',
		'feature': '✨',
		'epic': '🎯',
		'question': '❓',
		'docs': '📖',
	};
	
	const emoji = statusEmoji[bead.status];
	const icon = typeIcon[bead.type];
	
	return `${emoji} ${bead.id} [${bead.priority}] ${icon} ${bead.title}`;
}