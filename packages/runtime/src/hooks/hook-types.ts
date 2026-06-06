/**
 * Hook System - Type Definitions
 * 
 * Persistent work queue for agents. GUPP principle: "If work is on your Hook, you run it."
 * Hooks enable autonomous agents that pull work without waiting for human input.
 */

/**
 * Hook status values representing the lifecycle of work assignment
 */
export type HookStatus = 'pending' | 'active' | 'completed' | 'stalled';

/**
 * Hook represents a unit of work assigned to an agent
 * 
 * Hooks are persistent work items that survive agent restarts and provide
 * accountability for assigned tasks. They follow the GUPP principle where
 * an agent continuously checks its hook and executes assigned work.
 */
export interface Hook {
	/** Unique identifier for the hook */
	id: string;
	/** ID of the agent this hook is assigned to */
	agentId: string;
	/** Reference to the work unit (e.g., bead ID, issue number) */
	beadId: string;
	/** Current status of the hook */
	status: HookStatus;
	/** Timestamp when the hook was created/assigned */
	assignedAt: number;
	/** Timestamp when work started (optional) */
	startedAt?: number;
	/** Timestamp when work completed (optional) */
	completedAt?: number;
	/** Progress percentage 0-100 (optional) */
	progress?: number;
	/** Last heartbeat timestamp for monitoring (optional) */
	lastHeartbeat?: number;
	/** Optional metadata for additional context */
	metadata?: Record<string, unknown>;
}

/**
 * Hook creation options when assigning new work
 */
export interface HookCreateOptions {
	/** ID of the agent to assign work to */
	agentId: string;
	/** Reference to the work unit */
	beadId: string;
	/** Optional initial status (default: 'pending') */
	status?: HookStatus;
	/** Optional initial metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Hook update options when modifying an existing hook
 */
export interface HookUpdateOptions {
	/** New status for the hook */
	status?: HookStatus;
	/** Updated progress percentage */
	progress?: number;
	/** Updated heartbeat timestamp */
	lastHeartbeat?: number;
	/** Updated metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Hook store interface - must be implemented by all backends
 */
export interface HookStore {
	/**
	 * Save a hook to the store
	 * @param hook - Hook to save
	 */
	save(hook: Hook): Promise<void>;
	
	/**
	 * Load a hook by ID
	 * @param hookId - Hook ID to load
	 * @returns Hook or null if not found
	 */
	load(hookId: string): Promise<Hook | null>;
	
	/**
	 * Load a hook by agent ID
	 * @param agentId - Agent ID to find hook for
	 * @returns Hook assigned to the agent or null
	 */
	loadByAgentId(agentId: string): Promise<Hook | null>;
	
	/**
	 * List all hooks
	 * @returns Array of all hooks
	 */
	list(): Promise<Hook[]>;
	
	/**
	 * List hooks by status
	 * @param status - Status to filter by
	 * @returns Array of hooks with matching status
	 */
	listByStatus(status: HookStatus): Promise<Hook[]>;
	
	/**
	 * Delete a hook
	 * @param hookId - Hook ID to delete
	 */
	delete(hookId: string): Promise<void>;
	
	/**
	 * Pop work for an agent (GUPP principle)
	 * Returns and removes the next pending hook for the specified agent
	 * @param agentId - Agent ID to pop work for
	 * @returns Next pending hook or null
	 */
	popWork(agentId: string): Promise<Hook | null>;
	
	/**
	 * Update hook status
	 * @param hookId - Hook ID to update
	 * @param status - New status
	 */
	updateStatus(hookId: string, status: HookStatus): Promise<void>;
	
	/**
	 * Update hook progress
	 * @param hookId - Hook ID to update
	 * @param progress - Progress percentage 0-100
	 */
	updateProgress(hookId: string, progress: number): Promise<void>;
	
	/**
	 * Record heartbeat for a hook
	 * @param hookId - Hook ID
	 */
	heartbeat(hookId: string): Promise<void>;
}

/**
 * Hook manager interface for hook assignment and execution
 */
export interface HookManager {
	/**
	 * Create and assign a new hook
	 * @param options - Hook creation options
	 * @returns Created hook
	 */
	createHook(options: HookCreateOptions): Promise<Hook>;
	
	/**
	 * Assign a bead to an agent by creating a Hook
	 * @param beadId - ID of the bead to assign
	 * @param agentId - ID of the agent to assign the bead to
	 * @returns Created hook
	 */
	assignBead(beadId: string, agentId: string): Promise<Hook>;
	
	/**
	 * Handle bead status change
	 * @param beadId - ID of the bead that changed status
	 * @param oldStatus - Previous status of the bead
	 * @param newStatus - New status of the bead
	 */
	onBeadStatusChange(beadId: string, oldStatus: string, newStatus: string): Promise<void>;
	
	/**
	 * Mark hook as completed when bead closes
	 * @param beadId - ID of the closed bead
	 */
	onBeadClose(beadId: string): Promise<void>;
	
	/**
	 * Get hook by bead ID
	 * @param beadId - ID of the bead
	 * @returns Hook associated with the bead or null
	 */
	getHookByBeadId(beadId: string): Promise<Hook | null>;
	
	/**
	 * Get a hook by ID
	 * @param hookId - Hook ID
	 * @returns Hook or null
	 */
	getHook(hookId: string): Promise<Hook | null>;
	
	/**
	 * Get hook assigned to an agent
	 * @param agentId - Agent ID
	 * @returns Hook or null
	 */
	getAgentHook(agentId: string): Promise<Hook | null>;
	
	/**
	 * Claim work for an agent (GUPP - popWork)
	 * @param agentId - Agent ID to claim work for
	 * @returns Claimed hook or null
	 */
	claimWork(agentId: string): Promise<Hook | null>;
	
	/**
	 * Start work on a hook
	 * @param hookId - Hook ID to start
	 */
	startWork(hookId: string): Promise<void>;
	
	/**
	 * Complete a hook
	 * @param hookId - Hook ID to complete
	 */
	completeWork(hookId: string): Promise<void>;
	
	/**
	 * Mark a hook as stalled
	 * @param hookId - Hook ID to mark
	 */
	stall(hookId: string): Promise<void>;
	
	/**
	 * Release a hook (return to pending)
	 * @param hookId - Hook ID to release
	 */
	release(hookId: string): Promise<void>;
	
	/**
	 * Update progress on a hook
	 * @param hookId - Hook ID
	 * @param progress - Progress percentage
	 */
	updateProgress(hookId: string, progress: number): Promise<void>;
	
	/**
	 * Send heartbeat for a hook
	 * @param hookId - Hook ID
	 */
	sendHeartbeat(hookId: string): Promise<void>;
	
	/**
	 * List all hooks
	 * @returns Array of all hooks
	 */
	listHooks(): Promise<Hook[]>;
	
	/**
	 * List hooks by status
	 * @param status - Status to filter by
	 * @returns Array of matching hooks
	 */
	listByStatus(status: HookStatus): Promise<Hook[]>;
	
	/**
	 * Delete a hook
	 * @param hookId - Hook ID to delete
	 */
	deleteHook(hookId: string): Promise<void>;
}

/**
 * Generate a unique hook ID
 */
export function generateHookId(): string {
	return `hook_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a new hook from options
 */
export function createHook(options: HookCreateOptions): Hook {
	const now = Date.now();
	return {
		id: generateHookId(),
		agentId: options.agentId,
		beadId: options.beadId,
		status: options.status ?? 'pending',
		assignedAt: now,
		metadata: options.metadata,
	};
}