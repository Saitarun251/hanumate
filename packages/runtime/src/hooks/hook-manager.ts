/**
 * Hook Manager - Hook assignment and GUPP execution logic
 * 
 * Manages hook lifecycle and implements the GUPP principle:
 * "If work is on your Hook, you run it."
 */

import type {
	Hook,
	HookCreateOptions,
	HookManager as HookManagerInterface,
	HookStatus,
} from './hook-types.js';
import { createHook } from './hook-types.js';
import type { HookStore } from './hook-store.js';

/**
 * Hook Manager configuration
 */
export interface HookManagerConfig {
	/** Hook store for persistence */
	store: HookStore;
	/** Stall threshold in milliseconds (default: 5 minutes) */
	stallThreshold?: number;
}

/**
 * Callback type for bead assignment events
 */
export type BeadAssignCallback = (beadId: string, agentId: string, hook: Hook) => void;

/**
 * Callback type for bead status change events
 */
export type BeadStatusChangeCallback = (beadId: string, oldStatus: string, newStatus: string, hook: Hook) => void;

/**
 * Hook Manager implementation
 * 
 * Provides high-level API for hook management including creation,
 * assignment, work claiming (GUPP), and lifecycle management.
 */
export class HookManager implements HookManagerInterface {
	private readonly store: HookStore;
	private readonly stallThreshold: number;
	private readonly assignCallbacks: Set<BeadAssignCallback> = new Set();
	private readonly statusChangeCallbacks: Set<BeadStatusChangeCallback> = new Set();

	/**
	 * Create a new HookManager
	 * @param config - Hook manager configuration
	 */
	constructor(config: HookManagerConfig) {
		this.store = config.store;
		this.stallThreshold = config.stallThreshold ?? 5 * 60 * 1000; // 5 minutes default
	}

	/**
	 * Register a callback for bead assignment events
	 * @param callback - Function to call when a bead is assigned to a hook
	 */
	onAssign(callback: BeadAssignCallback): void {
		this.assignCallbacks.add(callback);
	}

	/**
	 * Unregister a bead assignment callback
	 * @param callback - Function to remove from callbacks
	 */
	offAssign(callback: BeadAssignCallback): void {
		this.assignCallbacks.delete(callback);
	}

	/**
	 * Register a callback for bead status change events
	 * @param callback - Function to call when bead status changes
	 */
	onStatusChange(callback: BeadStatusChangeCallback): void {
		this.statusChangeCallbacks.add(callback);
	}

	/**
	 * Unregister a bead status change callback
	 * @param callback - Function to remove from callbacks
	 */
	offStatusChange(callback: BeadStatusChangeCallback): void {
		this.statusChangeCallbacks.delete(callback);
	}

	/**
	 * Notify assign callbacks
	 */
	private notifyAssign(beadId: string, agentId: string, hook: Hook): void {
		for (const callback of this.assignCallbacks) {
			try {
				callback(beadId, agentId, hook);
			} catch (error) {
				console.error('Error in assign callback:', error);
			}
		}
	}

	/**
	 * Notify status change callbacks
	 */
	private notifyStatusChange(beadId: string, oldStatus: string, newStatus: string, hook: Hook): void {
		for (const callback of this.statusChangeCallbacks) {
			try {
				callback(beadId, oldStatus, newStatus, hook);
			} catch (error) {
				console.error('Error in status change callback:', error);
			}
		}
	}

	/**
	 * Create and assign a new hook
	 */
	async createHook(options: HookCreateOptions): Promise<Hook> {
		const hook = createHook(options);
		await this.store.save(hook);
		return hook;
	}

	/**
	 * Assign a bead to an agent by creating a Hook
	 * 
	 * This is the main integration point between Beads and Hooks.
	 * When a bead is assigned to an agent, a corresponding hook is created.
	 * 
	 * @param beadId - ID of the bead to assign
	 * @param agentId - ID of the agent to assign the bead to
	 * @returns Created hook
	 */
	async assignBead(beadId: string, agentId: string): Promise<Hook> {
		// Check if a hook already exists for this bead
		const existingHook = await this.store.loadByAgentId(agentId);
		if (existingHook && existingHook.beadId === beadId) {
			// Hook already exists for this bead/agent combination
			return existingHook;
		}

		// Create a new hook for this bead assignment
		const hook = createHook({
			agentId,
			beadId,
			status: 'pending',
			metadata: {
				assignedAt: Date.now(),
			},
		});

		await this.store.save(hook);

		// Notify callbacks
		this.notifyAssign(beadId, agentId, hook);

		return hook;
	}

	/**
	 * Handle bead status change
	 * 
	 * When a bead's status changes to 'in_progress', update or create the corresponding hook.
	 * 
	 * @param beadId - ID of the bead that changed status
	 * @param oldStatus - Previous status of the bead
	 * @param newStatus - New status of the bead
	 */
	async onBeadStatusChange(beadId: string, oldStatus: string, newStatus: string): Promise<void> {
		// Find hooks for this bead
		const allHooks = await this.store.list();
		const beadHooks = allHooks.filter(h => h.beadId === beadId);

		if (newStatus === 'in_progress') {
			// When bead goes to in_progress, ensure hook is active
			for (const hook of beadHooks) {
				if (hook.status === 'pending') {
					const updatedHook: Hook = {
						...hook,
						status: 'active',
						startedAt: Date.now(),
					};
					await this.store.save(updatedHook);
					this.notifyStatusChange(beadId, oldStatus, newStatus, updatedHook);
				} else {
					// Hook is already active, still notify the status change
					this.notifyStatusChange(beadId, oldStatus, newStatus, hook);
				}
			}
		} else if (newStatus === 'done' || newStatus === 'blocked') {
			// When bead is done or blocked, mark hook as completed
			for (const hook of beadHooks) {
				if (hook.status !== 'completed') {
					const updatedHook: Hook = {
						...hook,
						status: newStatus === 'done' ? 'completed' : hook.status,
						completedAt: newStatus === 'done' ? Date.now() : undefined,
						progress: newStatus === 'done' ? 100 : hook.progress,
					};
					await this.store.save(updatedHook);
					this.notifyStatusChange(beadId, oldStatus, newStatus, updatedHook);
				} else {
					// Hook is already completed, still notify the status change
					this.notifyStatusChange(beadId, oldStatus, newStatus, hook);
				}
			}
		}
	}

	/**
	 * Mark hook as completed when bead closes
	 * 
	 * @param beadId - ID of the closed bead
	 */
	async onBeadClose(beadId: string): Promise<void> {
		const allHooks = await this.store.list();
		const beadHooks = allHooks.filter(h => h.beadId === beadId);

		for (const hook of beadHooks) {
			if (hook.status !== 'completed') {
				const updatedHook: Hook = {
					...hook,
					status: 'completed',
					completedAt: Date.now(),
					progress: 100,
				};
				await this.store.save(updatedHook);
				this.notifyStatusChange(beadId, hook.status, 'completed', updatedHook);
			}
		}
	}

	/**
	 * Get hook by bead ID
	 * 
	 * @param beadId - ID of the bead
	 * @returns Hook associated with the bead or null
	 */
	async getHookByBeadId(beadId: string): Promise<Hook | null> {
		const allHooks = await this.store.list();
		return allHooks.find(h => h.beadId === beadId) ?? null;
	}

	/**
	 * Get a hook by ID
	 */
	async getHook(hookId: string): Promise<Hook | null> {
		return this.store.load(hookId);
	}

	/**
	 * Get hook assigned to an agent
	 */
	async getAgentHook(agentId: string): Promise<Hook | null> {
		return this.store.loadByAgentId(agentId);
	}

	/**
	 * Claim work for an agent (GUPP - Get Work from Hook)
	 * 
	 * This implements the GUPP principle. Agents should call this
	 * method to check for and claim pending work.
	 * 
	 * @param agentId - Agent ID to claim work for
	 * @returns Claimed hook or null if no work available
	 */
	async claimWork(agentId: string): Promise<Hook | null> {
		return this.store.popWork(agentId);
	}

	/**
	 * Start work on a hook
	 */
	async startWork(hookId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		if (hook.status !== 'pending') {
			throw new Error(`Hook ${hookId} is not in pending status (current: ${hook.status})`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status: 'active',
			startedAt: Date.now(),
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Complete a hook
	 */
	async completeWork(hookId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status: 'completed',
			completedAt: Date.now(),
			progress: 100,
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Mark a hook as stalled
	 */
	async stall(hookId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status: 'stalled',
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Release a hook (return to pending)
	 */
	async release(hookId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status: 'pending',
			startedAt: undefined,
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Update progress on a hook
	 */
	async updateProgress(hookId: string, progress: number): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			progress: Math.min(100, Math.max(0, progress)),
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Send heartbeat for a hook (indicates agent is still working)
	 */
	async sendHeartbeat(hookId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			lastHeartbeat: Date.now(),
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * List all hooks
	 */
	async listHooks(): Promise<Hook[]> {
		return this.store.list();
	}

	/**
	 * List hooks by status
	 */
	async listByStatus(status: HookStatus): Promise<Hook[]> {
		return this.store.listByStatus(status);
	}

	/**
	 * Delete a hook
	 */
	async deleteHook(hookId: string): Promise<void> {
		await this.store.delete(hookId);
	}

	/**
	 * Check for stalled hooks and mark them
	 * 
	 * Call this periodically to detect and mark stalled work.
	 * 
	 * @returns Array of hook IDs that were marked as stalled
	 */
	async detectStalledHooks(): Promise<string[]> {
		const activeHooks = await this.store.listByStatus('active');
		const stalledIds: string[] = [];
		const now = Date.now();
		
		for (const hook of activeHooks) {
			const lastActivity = hook.lastHeartbeat ?? hook.startedAt;
			
			if (lastActivity && now - lastActivity > this.stallThreshold) {
				await this.stall(hook.id);
				stalledIds.push(hook.id);
			}
		}
		
		return stalledIds;
	}

	/**
	 * Reassign a stalled hook to a different agent
	 * 
	 * @param hookId - Hook ID to reassign
	 * @param newAgentId - New agent ID
	 */
	async reassign(hookId: string, newAgentId: string): Promise<void> {
		const hook = await this.store.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			agentId: newAgentId,
			status: 'pending',
			startedAt: undefined,
		};
		
		await this.store.save(updatedHook);
	}

	/**
	 * Get statistics about hooks
	 */
	async getStats(): Promise<{
		total: number;
		pending: number;
		active: number;
		completed: number;
		stalled: number;
	}> {
		const hooks = await this.store.list();
		
		return {
			total: hooks.length,
			pending: hooks.filter((h) => h.status === 'pending').length,
			active: hooks.filter((h) => h.status === 'active').length,
			completed: hooks.filter((h) => h.status === 'completed').length,
			stalled: hooks.filter((h) => h.status === 'stalled').length,
		};
	}
}

/**
 * Create a hook manager with JSON file storage
 * 
 * @param hooksDir - Directory for hook storage (default: .hanumate/hooks)
 * @param config - Optional additional configuration
 */
export function createHookManager(
	hooksDir?: string,
	config?: { stallThreshold?: number }
): HookManager {
	// Dynamic import to avoid circular dependencies
	const { HookStore } = require('./hook-store.js');
	const store = new HookStore(hooksDir);
	
	return new HookManager({
		store,
		stallThreshold: config?.stallThreshold,
	});
}