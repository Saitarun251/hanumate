/**
 * Convoy Commands - CLI command handlers for convoy operations
 *
 * Provides handlers for:
 * - convoy create: Create a new convoy
 * - convoy list: List convoys with optional filtering
 * - convoy add: Add beads to a convoy
 * - convoy land: Land a convoy (mark as landed)
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { Convoy, ConvoyStatus, ListConvoyOptions } from '../../../convoys/convoy-types.js';
import { ConvoyManager } from '../../../convoys/convoy-manager.js';

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format a convoy for CLI output
 */
export function formatConvoy(convoy: Convoy, verbose = false): string {
	const statusColors: Record<ConvoyStatus, string> = {
		active: '\x1b[32m',   // Green
		completed: '\x1b[36m', // Cyan
		landed: '\x1b[33m',   // Yellow
	};
	const reset = '\x1b[0m';

	const status = convoy.status;
	const coloredStatus = `${statusColors[status]}${status}${reset}`;

	if (verbose) {
		const lines: string[] = [];
		lines.push(`Convoy: ${convoy.id}`);
		lines.push(`  Name:      ${convoy.name}`);
		lines.push(`  Status:    ${coloredStatus}`);
		lines.push(`  Created:   ${new Date(convoy.createdAt).toISOString()}`);
		lines.push(`  Created By: ${convoy.createdBy}`);
		lines.push(`  Beads:     ${convoy.beadIds.length} bead(s)`);

		if (convoy.beadIds.length > 0) {
			lines.push(`  Bead IDs:  ${convoy.beadIds.join(', ')}`);
		}

		if (convoy.completedAt) {
			lines.push(`  Completed:  ${new Date(convoy.completedAt).toISOString()}`);
		}

		if (convoy.notifyOnComplete && convoy.notifyOnComplete.length > 0) {
			lines.push(`  Notify:     ${convoy.notifyOnComplete.join(', ')}`);
		}

		return lines.join('\n');
	}

	const beadCount = convoy.beadIds.length;
	return `${convoy.id} ${convoy.name} (${coloredStatus}) - ${beadCount} bead(s)`;
}

/**
 * Format a list of convoys for CLI output
 */
export function formatConvoyList(convoys: Convoy[], showHeaders = true): string {
	if (convoys.length === 0) {
		return 'No convoys found';
	}

	const lines: string[] = [];

	if (showHeaders) {
		lines.push(`Found ${convoys.length} convoy(s):`);
		lines.push('');
	}

	for (const convoy of convoys) {
		lines.push(formatConvoy(convoy, false));
	}

	return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a convoy manager instance
 */
async function createConvoyManager(): Promise<ConvoyManager> {
	const manager = new ConvoyManager();
	await manager.init();
	return manager;
}

/**
 * Handle convoy create command
 */
async function handleConvoyCreate(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const name = args.args[0];
	const beadsStr = args.options.beads as string | undefined;
	const notifyStr = args.options.notify as string | undefined;

	if (!name) {
		console.error('Error: Convoy name is required');
		console.error('Usage: convoy create <name> [--beads <bead-ids>] [--notify <agent-ids>]');
		process.exit(1);
	}

	const beadIds = beadsStr ? beadsStr.split(',').map(b => b.trim()) : [];
	const notify = notifyStr ? notifyStr.split(',').map(n => n.trim()) : undefined;

	const manager = await createConvoyManager();
	const convoy = await manager.create(name, beadIds, { notify });

	console.log('Convoy created successfully:');
	console.log(formatConvoy(convoy, true));
}

/**
 * Handle convoy list command
 */
async function handleConvoyList(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const statusFilter = args.options.status as ConvoyStatus | undefined;
	const createdBy = args.options.createdBy as string | undefined;
	const beadId = args.options.beadId as string | undefined;

	const options: ListConvoyOptions = {};
	if (statusFilter) options.status = statusFilter;
	if (createdBy) options.createdBy = createdBy;
	if (beadId) options.beadId = beadId;

	const manager = await createConvoyManager();
	const convoys = await manager.list(options);

	console.log(formatConvoyList(convoys));
}

/**
 * Handle convoy add command
 */
async function handleConvoyAdd(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const convoyId = args.options.convoyId as string;
	const beadsStr = args.options.beads as string;

	if (!convoyId || !beadsStr) {
		console.error('Error: Both --convoyId and --beads are required');
		console.error('Usage: convoy add --convoyId <convoy-id> --beads <bead-ids>');
		process.exit(1);
	}

	const beadIds = beadsStr.split(',').map(b => b.trim());

	const manager = await createConvoyManager();
	const convoy = await manager.addBeads(convoyId, beadIds);

	if (!convoy) {
		console.error(`Error: Convoy not found: ${convoyId}`);
		process.exit(1);
	}

	console.log('Beads added successfully:');
	console.log(formatConvoy(convoy, true));
}

/**
 * Handle convoy land command
 */
async function handleConvoyLand(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const convoyId = args.options.convoyId as string;

	if (!convoyId) {
		console.error('Error: --convoyId is required');
		console.error('Usage: convoy land --convoyId <convoy-id>');
		process.exit(1);
	}

	const manager = await createConvoyManager();
	const convoy = await manager.land(convoyId);

	if (!convoy) {
		console.error(`Error: Convoy not found: ${convoyId}`);
		process.exit(1);
	}

	console.log('Convoy landed successfully:');
	console.log(formatConvoy(convoy, true));
}

/**
 * Handle convoy show command (bonus)
 */
async function handleConvoyShow(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const convoyId = args.args[0];

	if (!convoyId) {
		console.error('Error: Convoy ID is required');
		console.error('Usage: convoy show <convoy-id>');
		process.exit(1);
	}

	const manager = await createConvoyManager();
	const convoy = await manager.get(convoyId);

	if (!convoy) {
		console.error(`Error: Convoy not found: ${convoyId}`);
		process.exit(1);
	}

	console.log(formatConvoy(convoy, true));
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Convoy create command
 */
export const convoyCreateCommand: Command = {
	name: 'convoy create',
	description: 'Create a new convoy',
	usage: 'duck convoy create <name> [--beads <bead-ids>] [--notify <agent-ids>]',
	options: [
		{
			name: 'beads',
			type: 'string',
			description: 'Comma-separated bead IDs to include',
		},
		{
			name: 'notify',
			type: 'string',
			description: 'Comma-separated agent IDs to notify on completion',
		},
	],
	handler: handleConvoyCreate,
};

/**
 * Convoy list command
 */
export const convoyListCommand: Command = {
	name: 'convoy list',
	description: 'List convoys with optional filtering',
	usage: 'duck convoy list [--status <status>] [--createdBy <agent>] [--beadId <bead-id>]',
	options: [
		{
			name: 'status',
			type: 'string',
			description: 'Filter by status (active, completed, landed)',
		},
		{
			name: 'createdBy',
			type: 'string',
			description: 'Filter by creator',
		},
		{
			name: 'beadId',
			type: 'string',
			description: 'Filter by bead ID (convoys containing this bead)',
		},
	],
	handler: handleConvoyList,
};

/**
 * Convoy add command
 */
export const convoyAddCommand: Command = {
	name: 'convoy add',
	description: 'Add beads to a convoy',
	usage: 'duck convoy add --convoyId <convoy-id> --beads <bead-ids>',
	options: [
		{
			name: 'convoyId',
			type: 'string',
			description: 'ID of the convoy',
			required: true,
		},
		{
			name: 'beads',
			type: 'string',
			description: 'Comma-separated bead IDs to add',
			required: true,
		},
	],
	handler: handleConvoyAdd,
};

/**
 * Convoy land command
 */
export const convoyLandCommand: Command = {
	name: 'convoy land',
	description: 'Land a convoy (mark as landed)',
	usage: 'duck convoy land --convoyId <convoy-id>',
	options: [
		{
			name: 'convoyId',
			type: 'string',
			description: 'ID of the convoy to land',
			required: true,
		},
	],
	handler: handleConvoyLand,
};

/**
 * Convoy show command
 */
export const convoyShowCommand: Command = {
	name: 'convoy show',
	description: 'Show detailed information about a convoy',
	usage: 'duck convoy show <convoy-id>',
	options: [],
	handler: handleConvoyShow,
};

/**
 * All convoy commands
 */
export const convoyCommands: Command[] = [
	convoyCreateCommand,
	convoyListCommand,
	convoyAddCommand,
	convoyLandCommand,
	convoyShowCommand,
];

/**
 * Register all convoy commands to a registry
 */
export function registerConvoyCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of convoyCommands) {
		registry.register(cmd);
	}
}