/**
 * Hook Commands - CLI command handlers for hook operations
 *
 * Provides handlers for:
 * - hook list: List all hooks or filter by status
 * - hook assign: Assign a bead to an agent
 * - hook status: Show detailed status of a hook
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { Hook, HookStatus } from '../../../hooks/hook-types.js';
import { HookManager } from '../../../hooks/hook-manager.js';
import { HookStore } from '../../../hooks/hook-store.js';

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format a hook for CLI output
 */
export function formatHook(hook: Hook, verbose = false): string {
	const statusColors: Record<HookStatus, string> = {
		pending: '\x1b[33m',   // Yellow
		active: '\x1b[32m',    // Green
		completed: '\x1b[36m', // Cyan
		stalled: '\x1b[31m',   // Red
	};
	const reset = '\x1b[0m';

	const status = hook.status;
	const coloredStatus = `${statusColors[status]}${status}${reset}`;

	if (verbose) {
		const lines: string[] = [];
		lines.push(`Hook: ${hook.id}`);
		lines.push(`  Agent:   ${hook.agentId}`);
		lines.push(`  Bead:    ${hook.beadId}`);
		lines.push(`  Status:  ${coloredStatus}`);
		lines.push(`  Assigned: ${new Date(hook.assignedAt).toISOString()}`);

		if (hook.startedAt) {
			lines.push(`  Started:  ${new Date(hook.startedAt).toISOString()}`);
		}
		if (hook.completedAt) {
			lines.push(`  Completed: ${new Date(hook.completedAt).toISOString()}`);
		}
		if (hook.progress !== undefined) {
			lines.push(`  Progress: ${hook.progress}%`);
		}
		if (hook.lastHeartbeat) {
			const elapsed = Math.floor((Date.now() - hook.lastHeartbeat) / 1000);
			lines.push(`  Last heartbeat: ${elapsed}s ago`);
		}

		return lines.join('\n');
	}

	const progress = hook.progress !== undefined ? ` [${hook.progress}%]` : '';
	return `${hook.id} → ${hook.agentId} (${coloredStatus})${progress}`;
}

/**
 * Format a list of hooks for CLI output
 */
export function formatHookList(hooks: Hook[], showHeaders = true): string {
	if (hooks.length === 0) {
		return 'No hooks found';
	}

	const lines: string[] = [];

	if (showHeaders) {
		lines.push(`Found ${hooks.length} hook(s):`);
		lines.push('');
	}

	for (const hook of hooks) {
		lines.push(formatHook(hook, false));
	}

	return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a hook manager instance
 */
function createHookManager(): HookManager {
	const store = new HookStore();
	return new HookManager({ store });
}

/**
 * Handle hook list command
 */
async function handleHookList(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const manager = createHookManager();

	const statusFilter = args.options.status as HookStatus | undefined;
	let hooks: Hook[];

	if (statusFilter) {
		hooks = await manager.listByStatus(statusFilter);
	} else {
		hooks = await manager.listHooks();
	}

	console.log(formatHookList(hooks));
}

/**
 * Handle hook assign command
 */
async function handleHookAssign(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const beadId = args.options.beadId as string;
	const agentId = args.options.agentId as string;

	if (!beadId || !agentId) {
		console.error('Error: Both --beadId and --agentId are required');
		console.error('Usage: hook assign --beadId <bead-id> --agentId <agent-id>');
		process.exit(1);
	}

	const manager = createHookManager();
	const hook = await manager.assignBead(beadId, agentId);

	console.log('Hook assigned successfully:');
	console.log(formatHook(hook, true));
}

/**
 * Handle hook status command
 */
async function handleHookStatus(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const hookId = args.options.hookId as string;

	if (!hookId) {
		console.error('Error: --hookId is required');
		console.error('Usage: hook status --hookId <hook-id>');
		process.exit(1);
	}

	const manager = createHookManager();
	const hook = await manager.getHook(hookId);

	if (!hook) {
		console.error(`Error: Hook not found: ${hookId}`);
		process.exit(1);
	}

	console.log(formatHook(hook, true));
}

/**
 * Handle hook stats command (bonus)
 */
async function handleHookStats(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const manager = createHookManager();
	const stats = await manager.getStats();

	console.log('Hook Statistics:');
	console.log(`  Total:      ${stats.total}`);
	console.log(`  Pending:    ${stats.pending}`);
	console.log(`  Active:     ${stats.active}`);
	console.log(`  Completed:  ${stats.completed}`);
	console.log(`  Stalled:    ${stats.stalled}`);
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Hook list command - list all hooks or filter by status
 */
export const hookListCommand: Command = {
	name: 'hook list',
	description: 'List all hooks or filter by status',
	usage: 'duck hook list [--status <pending|active|completed|stalled>]',
	options: [
		{
			name: 'status',
			type: 'string',
			description: 'Filter hooks by status (pending, active, completed, stalled)',
		},
	],
	handler: handleHookList,
};

/**
 * Hook assign command - assign a bead to an agent
 */
export const hookAssignCommand: Command = {
	name: 'hook assign',
	description: 'Assign a bead to an agent by creating a hook',
	usage: 'duck hook assign --beadId <bead-id> --agentId <agent-id>',
	options: [
		{
			name: 'beadId',
			type: 'string',
			description: 'ID of the bead to assign',
			required: true,
		},
		{
			name: 'agentId',
			type: 'string',
			description: 'ID of the agent to assign to',
			required: true,
		},
	],
	handler: handleHookAssign,
};

/**
 * Hook status command - show detailed status of a hook
 */
export const hookStatusCommand: Command = {
	name: 'hook status',
	description: 'Show detailed status of a hook',
	usage: 'duck hook status --hookId <hook-id>',
	options: [
		{
			name: 'hookId',
			type: 'string',
			description: 'ID of the hook to show',
			required: true,
		},
	],
	handler: handleHookStatus,
};

/**
 * Hook stats command - show hook statistics
 */
export const hookStatsCommand: Command = {
	name: 'hook stats',
	description: 'Show hook statistics',
	usage: 'duck hook stats',
	options: [],
	handler: handleHookStats,
};

/**
 * All hook commands
 */
export const hookCommands: Command[] = [
	hookListCommand,
	hookAssignCommand,
	hookStatusCommand,
	hookStatsCommand,
];

/**
 * Register all hook commands to a registry
 */
export function registerHookCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of hookCommands) {
		registry.register(cmd);
	}
}