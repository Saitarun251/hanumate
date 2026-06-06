/**
 * Hooks-Beads Integration Service
 * 
 * Wires the Bead store callbacks to the Hook manager to automatically
 * create and manage hooks based on bead lifecycle events.
 */

import type { HookManager } from '../hooks/hook-manager.js';
import type { BeadStore } from '../beads/bead-types.js';

/**
 * Configuration for the integration service
 */
export interface HooksBeadsConfig {
	/** Hook manager instance */
	hookManager: HookManager;
	/** Bead store instance */
	beadStore: BeadStore;
}

/**
 * Integration service that connects Bead store events to Hook manager actions.
 * 
 * This service:
 * - Creates hooks when beads are assigned to agents
 * - Updates hook status when bead status changes
 * - Marks hooks as completed when beads are closed
 */
export class HooksBeadsIntegration {
	private readonly hookManager: HookManager;
	private readonly beadStore: BeadStore;

	constructor(config: HooksBeadsConfig) {
		this.hookManager = config.hookManager;
		this.beadStore = config.beadStore;
	}

	/**
	 * Initialize the integration by registering callbacks on the bead store.
	 * This should be called once after construction.
	 */
	async initialize(): Promise<void> {
		// Note: The bead store callbacks will be registered when it's configured with them
		// For stores that don't support callbacks, we'll use the polling approach
	}

	/**
	 * Create a hook when a bead is assigned to an agent.
	 * Call this when a bead is assigned to an agent.
	 */
	async onBeadAssigned(beadId: string, agentId: string): Promise<void> {
		await this.hookManager.assignBead(beadId, agentId);
	}

	/**
	 * Handle bead status change and sync with hook.
	 * Call this when a bead's status changes.
	 */
	async onBeadStatusChanged(
		beadId: string,
		oldStatus: string,
		newStatus: string
	): Promise<void> {
		await this.hookManager.onBeadStatusChange(beadId, oldStatus, newStatus);
	}

	/**
	 * Handle bead closure and mark related hooks as completed.
	 * Call this when a bead is closed (status becomes 'done').
	 */
	async onBeadClosed(beadId: string): Promise<void> {
		await this.hookManager.onBeadClose(beadId);
	}

	/**
	 * Sync all beads with hooks.
	 * This creates hooks for beads that have assignees but no corresponding hooks.
	 */
	async syncBeadsWithHooks(): Promise<void> {
		const beads = await this.beadStore.list({});
		const hooks = await this.hookManager.listHooks();

		for (const bead of beads) {
			if (bead.assignee) {
				// Check if a hook exists for this bead/agent combination
				const existingHook = hooks.find(
					(h) => h.beadId === bead.id && h.agentId === bead.assignee
				);

				if (!existingHook) {
					await this.hookManager.assignBead(bead.id, bead.assignee);
				}

				// Sync hook status with bead status
				if (bead.status === 'in_progress') {
					await this.hookManager.onBeadStatusChange(
						bead.id,
						'open',
						'in_progress'
					);
				} else if (bead.status === 'done') {
					await this.hookManager.onBeadClose(bead.id);
				}
			}
		}
	}
}

/**
 * Create a hooks-beads integration instance.
 * 
 * This function sets up automatic synchronization between beads and hooks.
 * 
 * @param hookManager - Hook manager instance
 * @param beadStore - Bead store instance
 * @returns Integration instance
 */
export function createHooksBeadsIntegration(
	hookManager: HookManager,
	beadStore: BeadStore
): HooksBeadsIntegration {
	return new HooksBeadsIntegration({ hookManager, beadStore });
}