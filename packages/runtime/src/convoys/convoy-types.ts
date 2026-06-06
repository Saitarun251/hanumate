/**
 * Convoy Types - Type definitions for the Convoys System
 *
 * Convoys allow grouping related Beads (work units) together for tracking
 * and coordinated completion.
 */

/**
 * Convoy status values
 */
export type ConvoyStatus = 'active' | 'completed' | 'landed';

/**
 * Convoy - A group of Beads bundled together for coordinated work tracking
 */
export interface Convoy {
	/** Unique identifier in format: cv-xxxxx (5 char alphanumeric) */
	id: string;
	/** Human-readable name for the convoy */
	name: string;
	/** Array of Bead IDs included in this convoy */
	beadIds: string[];
	/** Current status of the convoy */
	status: ConvoyStatus;
	/** Agent ID that created this convoy */
	createdBy: string;
	/** Timestamp when the convoy was created */
	createdAt: number;
	/** Timestamp when the convoy was completed (if applicable) */
	completedAt?: number;
	/** Agent IDs to notify when convoy is completed */
	notifyOnComplete?: string[];
	/** Optional metadata for additional information */
	metadata?: Record<string, unknown>;
}

/**
 * Options for creating a new convoy
 */
export interface CreateConvoyOptions {
	/** Bead IDs to include in the convoy */
	beadIds?: string[];
	/** Agent IDs to notify on completion */
	notify?: string[];
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Update options for modifying a convoy
 */
export interface UpdateConvoyOptions {
	/** New name for the convoy */
	name?: string;
	/** New status for the convoy */
	status?: ConvoyStatus;
	/** Metadata updates */
	metadata?: Record<string, unknown>;
}

/**
 * Filter options for listing convoys
 */
export interface ListConvoyOptions {
	/** Filter by status */
	status?: ConvoyStatus;
	/** Filter by creator */
	createdBy?: string;
	/** Filter by bead ID (convoys containing this bead) */
	beadId?: string;
}

/**
 * Convoy change event for listeners
 */
export interface ConvoyChangeEvent {
	/** Type of change that occurred */
	type: 'created' | 'updated' | 'deleted' | 'bead_added' | 'bead_removed';
	/** The convoy that was changed */
	convoy: Convoy;
	/** Timestamp of the change */
	timestamp: number;
}

/**
 * Convoy listener callback type
 */
export type ConvoyListener = (event: ConvoyChangeEvent) => void;