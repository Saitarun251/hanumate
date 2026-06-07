/**
 * Bead Commands - CLI command handlers for bead operations
 *
 * Provides handlers for:
 * - bead create: Create a new bead
 * - bead list: List beads with optional filtering
 * - bead show: Show detailed information about a bead
 * - bead update: Update bead properties
 * - bead close: Mark a bead as done
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { BeadType, BeadPriority, BeadStatus } from '../../../beads/bead-types.js';
import { createInMemoryBeadStore } from '../../../beads/bead-store.js';
import { BeadCommands, formatBeadForCLI, formatBeadList } from '../../../beads/bead-commands.js';
import { isValidBeadId } from '../../../beads/bead-types.js';

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a bead commands instance
 */
function createBeadCommandsInstance(): BeadCommands {
	const store = createInMemoryBeadStore();
	return new BeadCommands(store, 'cli');
}

/**
 * Handle bead create command
 */
async function handleBeadCreate(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const title = args.args[0];
	const description = args.options.description as string;
	const type = args.options.type as BeadType | undefined;
	const priority = args.options.priority as BeadPriority | undefined;
	const assignee = args.options.assignee as string | undefined;
	const tagsStr = args.options.tags as string | undefined;
	const dependsOnStr = args.options.dependsOn as string | undefined;

	if (!title) {
		console.error('Error: Title is required');
		console.error('Usage: bead create <title> [--description "..."] [--type <type>] [--priority <priority>]');
		process.exit(1);
	}

	const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : undefined;
	const dependsOn = dependsOnStr ? dependsOnStr.split(',').map(t => t.trim()) : undefined;

	const commands = createBeadCommandsInstance();
	const result = await commands.create({
		title,
		description,
		type,
		priority,
		assignee,
		tags,
		dependsOn,
	});

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log('Bead created successfully:');
	console.log(formatBeadForCLI(result.data!, true));
}

/**
 * Handle bead list command
 */
async function handleBeadList(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const status = args.options.status as BeadStatus | undefined;
	const type = args.options.type as BeadType | undefined;
	const priority = args.options.priority as BeadPriority | undefined;
	const assignee = args.options.assignee as string | undefined;
	const tagsStr = args.options.tags as string | undefined;
	const sort = args.options.sort as 'priority' | 'created' | 'updated' | undefined;

	const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : undefined;

	const commands = createBeadCommandsInstance();
	const result = await commands.list({
		status,
		type,
		priority,
		assignee,
		tags,
		sort,
	});

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log(formatBeadList(result.data!));
}

/**
 * Handle bead show command
 */
async function handleBeadShow(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const beadId = args.args[0];

	if (!beadId) {
		console.error('Error: Bead ID is required');
		console.error('Usage: bead show <bead-id>');
		process.exit(1);
	}

	if (!isValidBeadId(beadId)) {
		console.error(`Error: Invalid bead ID format: ${beadId}`);
		console.error('Bead IDs must be in format: rd-xxxxx (e.g., rd-abc12)');
		process.exit(1);
	}

	const commands = createBeadCommandsInstance();
	const result = await commands.show(beadId);

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log(formatBeadForCLI(result.data!, true));
}

/**
 * Handle bead update command
 */
async function handleBeadUpdate(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const beadId = args.args[0];
	const title = args.options.title as string | undefined;
	const description = args.options.description as string;
	const type = args.options.type as BeadType | undefined;
	const priority = args.options.priority as BeadPriority | undefined;
	const status = args.options.status as BeadStatus | undefined;
	const assignee = args.options.assignee as string | undefined;
	const addTagsStr = args.options.addTags as string | undefined;
	const removeTagsStr = args.options.removeTags as string | undefined;

	if (!beadId) {
		console.error('Error: Bead ID is required');
		console.error('Usage: bead update <bead-id> [--title "..."] [--status <status>]');
		process.exit(1);
	}

	const addTags = addTagsStr ? addTagsStr.split(',').map(t => t.trim()) : undefined;
	const removeTags = removeTagsStr ? removeTagsStr.split(',').map(t => t.trim()) : undefined;

	const commands = createBeadCommandsInstance();
	const result = await commands.update(beadId, {
		title,
		description,
		type,
		priority,
		status,
		assignee,
		addTags,
		removeTags,
	});

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log('Bead updated successfully:');
	console.log(formatBeadForCLI(result.data!, true));
}

/**
 * Handle bead close command
 */
async function handleBeadClose(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const beadId = args.args[0];

	if (!beadId) {
		console.error('Error: Bead ID is required');
		console.error('Usage: bead close <bead-id>');
		process.exit(1);
	}

	const commands = createBeadCommandsInstance();
	const result = await commands.close(beadId);

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log('Bead closed successfully:');
	console.log(formatBeadForCLI(result.data!, true));
}

/**
 * Handle bead ready command (bonus)
 */
async function handleBeadReady(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const commands = createBeadCommandsInstance();
	const result = await commands.ready();

	if (!result.success) {
		console.error(`Error: ${result.error}`);
		process.exit(1);
	}

	console.log('Ready beads (unblocked, not done):');
	console.log(formatBeadList(result.data!));
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Bead create command
 */
export const beadCreateCommand: Command = {
	name: 'bead create',
	description: 'Create a new bead',
	usage: 'hanumate bead create <title> [--description "..."] [--type <type>] [--priority <priority>] [--tags <tags>] [--dependsOn <bead-ids>]',
	options: [
		{
			name: 'description',
			type: 'string',
			short: 'd',
			description: 'Bead description',
		},
		{
			name: 'type',
			type: 'string',
			description: 'Bead type (task, bug, feature, epic, question, docs)',
		},
		{
			name: 'priority',
			type: 'string',
			short: 'p',
			description: 'Priority (P0, P1, P2, P3, P4)',
		},
		{
			name: 'assignee',
			type: 'string',
			description: 'Assign to agent ID',
		},
		{
			name: 'tags',
			type: 'string',
			description: 'Comma-separated tags',
		},
		{
			name: 'dependsOn',
			type: 'string',
			description: 'Comma-separated bead IDs this depends on',
		},
	],
	handler: handleBeadCreate,
};

/**
 * Bead list command
 */
export const beadListCommand: Command = {
	name: 'bead list',
	description: 'List beads with optional filtering',
	usage: 'hanumate bead list [--status <status>] [--type <type>] [--priority <priority>] [--assignee <agent>] [--tags <tags>] [--sort <priority|created|updated>]',
	options: [
		{
			name: 'status',
			type: 'string',
			description: 'Filter by status (open, in_progress, done, blocked)',
		},
		{
			name: 'type',
			type: 'string',
			description: 'Filter by type (task, bug, feature, epic, question, docs)',
		},
		{
			name: 'priority',
			type: 'string',
			description: 'Filter by priority (P0, P1, P2, P3, P4)',
		},
		{
			name: 'assignee',
			type: 'string',
			description: 'Filter by assignee',
		},
		{
			name: 'tags',
			type: 'string',
			description: 'Filter by tags (comma-separated)',
		},
		{
			name: 'sort',
			type: 'string',
			description: 'Sort by (priority, created, updated)',
		},
	],
	handler: handleBeadList,
};

/**
 * Bead show command
 */
export const beadShowCommand: Command = {
	name: 'bead show',
	description: 'Show detailed information about a bead',
	usage: 'hanumate bead show <bead-id>',
	options: [],
	handler: handleBeadShow,
};

/**
 * Bead update command
 */
export const beadUpdateCommand: Command = {
	name: 'bead update',
	description: 'Update bead properties',
	usage: 'hanumate bead update <bead-id> [--title "..."] [--status <status>] [--priority <priority>]',
	options: [
		{
			name: 'title',
			type: 'string',
			description: 'New title',
		},
		{
			name: 'description',
			type: 'string',
			description: 'New description',
		},
		{
			name: 'type',
			type: 'string',
			description: 'New type',
		},
		{
			name: 'priority',
			type: 'string',
			description: 'New priority',
		},
		{
			name: 'status',
			type: 'string',
			description: 'New status (open, in_progress, done, blocked)',
		},
		{
			name: 'assignee',
			type: 'string',
			description: 'New assignee',
		},
		{
			name: 'addTags',
			type: 'string',
			description: 'Tags to add (comma-separated)',
		},
		{
			name: 'removeTags',
			type: 'string',
			description: 'Tags to remove (comma-separated)',
		},
	],
	handler: handleBeadUpdate,
};

/**
 * Bead close command
 */
export const beadCloseCommand: Command = {
	name: 'bead close',
	description: 'Mark a bead as done/closed',
	usage: 'hanumate bead close <bead-id>',
	options: [],
	handler: handleBeadClose,
};

/**
 * Bead ready command
 */
export const beadReadyCommand: Command = {
	name: 'bead ready',
	description: 'Show beads ready to work (unblocked, not done)',
	usage: 'hanumate bead ready',
	options: [],
	handler: handleBeadReady,
};

/**
 * All bead commands
 */
export const beadCommands: Command[] = [
	beadCreateCommand,
	beadListCommand,
	beadShowCommand,
	beadUpdateCommand,
	beadCloseCommand,
	beadReadyCommand,
];

/**
 * Register all bead commands to a registry
 */
export function registerBeadCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of beadCommands) {
		registry.register(cmd);
	}
}