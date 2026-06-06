/**
 * Convoys Module - Work bundling for Hanumate
 *
 * Convoys allow grouping related Beads (work units) together for
 * coordinated tracking and completion.
 *
 * @example
 * ```typescript
 * import { ConvoyManager } from '@hanumate/runtime';
 *
 * const manager = new ConvoyManager();
 * await manager.init();
 *
 * // Create a new convoy
 * const convoy = await manager.create('Feature X', ['rd-abc12', 'rd-def34'], {
 *   notify: ['agent-1', 'agent-2']
 * });
 *
 * // Add more beads
 * await manager.addBeads(convoy.id, ['rd-ghi56']);
 *
 * // List all active convoys
 * const active = await manager.getActive();
 *
 * // Land the convoy when done
 * await manager.land(convoy.id);
 * ```
 */

// Types
export type {
	Convoy,
	ConvoyStatus,
	CreateConvoyOptions,
	UpdateConvoyOptions,
	ListConvoyOptions,
	ConvoyChangeEvent,
	ConvoyListener,
} from './convoy-types.js';

// Store
export { ConvoyStore, ConvoyStoreError, DEFAULT_CONVOYS_DIR } from './convoy-store.js';

// Manager
export { ConvoyManager, createConvoyManager } from './convoy-manager.js';