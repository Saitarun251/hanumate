/**
 * Beads Module - Git-backed issue tracking system
 * 
 * A lightweight, git-backed work tracking system for agents.
 * Beads are persisted to disk as JSON files in .rubberduck/beads/
 * 
 * @example
 * ```typescript
 * import { createBeadStore, createBeadCommands } from '@rubberduck/runtime/beads';
 * 
 * const store = createBeadStore();
 * const commands = createBeadCommands(store);
 * 
 * // Create a bead
 * const bead = await commands.create({
 *   title: 'Fix auth bug',
 *   type: 'bug',
 *   priority: 'P1',
 * });
 * 
 * // List beads
 * const beads = await commands.list({ status: 'open' });
 * 
 * // Get ready beads
 * const ready = await commands.ready();
 * ```
 */

// Types
export {
	type Bead,
	type BeadType,
	type BeadPriority,
	type BeadStatus,
	type CreateBeadInput,
	type UpdateBeadInput,
	type BeadFilter,
	type BeadStore,
} from './bead-types.js';

export {
	type CreateBeadOptions,
	type UpdateBeadOptions,
	type ListBeadsOptions,
	type BeadCommandResult,
} from './bead-commands.js';

// Utility functions
export {
	generateBeadId,
	isValidBeadId,
	getDefaultStatus,
	isBlocked,
	sortByPriority,
	formatBead,
} from './bead-types.js';

// Store implementations
export {
	type BeadStoreConfig,
	JsonBeadStore,
	createBeadStore,
	createInMemoryBeadStore,
} from './bead-store.js';

// CLI commands
export {
	BeadCommands,
	createBeadCommands,
	formatBeadForCLI,
	formatBeadList,
} from './bead-commands.js';