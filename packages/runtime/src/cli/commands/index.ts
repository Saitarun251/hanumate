/**
 * CLI Commands - Command handlers for the Duck CLI
 *
 * Exports all command modules:
 * - hook: Hook management commands
 * - bead: Bead management commands
 * - convoy: Convoy management commands
 * - mail: Mail messaging commands
 * - refinery: Merge queue commands
 * - session: Session management commands
 * - server: Server management commands
 */

import type { Command } from '../cli-types.js';

// Hook commands
export {
	hookListCommand,
	hookAssignCommand,
	hookStatusCommand,
	hookStatsCommand,
	hookCommands,
	registerHookCommands,
	formatHook,
	formatHookList,
} from './hook/commands.js';
import { registerHookCommands } from './hook/commands.js';

// Bead commands (re-export from bead module for compatibility)
export {
	beadCreateCommand,
	beadListCommand,
	beadShowCommand,
	beadUpdateCommand,
	beadCloseCommand,
	beadReadyCommand,
	beadCommands,
	registerBeadCommands,
} from './bead/commands.js';
import { registerBeadCommands } from './bead/commands.js';

export { formatBeadForCLI, formatBeadList } from '../../beads/index.js';

// Convoy commands
export {
	convoyCreateCommand,
	convoyListCommand,
	convoyAddCommand,
	convoyLandCommand,
	convoyShowCommand,
	convoyCommands,
	registerConvoyCommands,
	formatConvoy,
	formatConvoyList,
} from './convoy/commands.js';
import { registerConvoyCommands } from './convoy/commands.js';

// Mail commands
export {
	mailSendCommand,
	mailInboxCommand,
	mailReadCommand,
	mailCountCommand,
	mailCommands,
	registerMailCommands,
	formatMail,
	formatMailList,
} from './mail/commands.js';
import { registerMailCommands } from './mail/commands.js';

// Refinery commands
export {
	refineryListCommand,
	refineryStatusCommand,
	refineryEnqueueCommand,
	refineryShowCommand,
	refineryCommands,
	registerRefineryCommands,
	formatMergeRequest,
	formatMergeRequestList,
	formatRefineryStatus,
} from './refinery/commands.js';
import { registerRefineryCommands } from './refinery/commands.js';

// Session commands
export {
	sessionListCommand,
	sessionShowCommand,
	sessionStatsCommand,
	sessionCommands,
	registerSessionCommands,
	formatSession,
	formatSessionList,
} from './session/commands.js';
import { registerSessionCommands } from './session/commands.js';

// Server commands
export {
	serverStartCommand,
	serverStopCommand,
	serverStatusCommand,
	serverCommands,
	registerServerCommands,
	formatServerStatus,
	formatServerStart,
	formatServerStop,
} from './server/commands.js';
import { registerServerCommands } from './server/commands.js';

/**
 * Register all commands to a registry
 */
export function registerAllCommands(registry: { register: (cmd: Command) => void }): void {
	registerHookCommands(registry);
	registerBeadCommands(registry);
	registerConvoyCommands(registry);
	registerMailCommands(registry);
	registerRefineryCommands(registry);
	registerSessionCommands(registry);
	registerServerCommands(registry);
}