/**
 * Refinery Commands - CLI command handlers for refinery/merge queue operations
 *
 * Provides handlers for:
 * - refinery list: List merge requests in the queue
 * - refinery status: Show refinery status
 * - refinery enqueue: Add a merge request to the queue
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { MergeRequest, MergeStatus, RefineryStatus } from '../../../refinery/refinery-types.js';
import { Refinery } from '../../../refinery/refinery.js';

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format a merge request for CLI output
 */
export function formatMergeRequest(mr: MergeRequest, verbose = false): string {
	const statusColors: Record<MergeStatus, string> = {
		pending: '\x1b[33m',   // Yellow
		testing: '\x1b[34m',   // Blue
		passed: '\x1b[32m',    // Green
		failed: '\x1b[31m',    // Red
		merged: '\x1b[36m',    // Cyan
		cancelled: '\x1b[90m', // Gray
	};
	const reset = '\x1b[0m';

	const status = mr.status;
	const coloredStatus = `${statusColors[status]}${status}${reset}`;

	if (verbose) {
		const lines: string[] = [];
		lines.push(`Merge Request: ${mr.id}`);
		lines.push(`  Branch:   ${mr.branch}`);
		lines.push(`  Author:   ${mr.author}`);
		lines.push(`  Status:   ${coloredStatus}`);
		lines.push(`  Created:  ${new Date(mr.createdAt).toISOString()}`);
		lines.push(`  Updated:  ${new Date(mr.updatedAt).toISOString()}`);

		if (mr.beadId) {
			lines.push(`  Bead:     ${mr.beadId}`);
		}
		if (mr.convoyId) {
			lines.push(`  Convoy:   ${mr.convoyId}`);
		}

		if (mr.gateResults && mr.gateResults.length > 0) {
			lines.push('');
			lines.push('  Gate Results:');
			for (const result of mr.gateResults) {
				const resultIcon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
				lines.push(`    ${resultIcon} ${result.name}: ${result.details}`);
			}
		}

		return lines.join('\n');
	}

	const shortBranch = mr.branch.length > 30 ? mr.branch.slice(0, 27) + '...' : mr.branch;
	return `${mr.id} ${shortBranch} (${coloredStatus}) by ${mr.author}`;
}

/**
 * Format a list of merge requests for CLI output
 */
export function formatMergeRequestList(mrs: MergeRequest[], showHeaders = true): string {
	if (mrs.length === 0) {
		return 'No merge requests in queue';
	}

	const lines: string[] = [];

	if (showHeaders) {
		lines.push(`Found ${mrs.length} merge request(s):`);
		lines.push('');
	}

	for (const mr of mrs) {
		lines.push(formatMergeRequest(mr, false));
	}

	return lines.join('\n');
}

/**
 * Format refinery status for CLI output
 */
export function formatRefineryStatus(status: RefineryStatus): string {
	const lines: string[] = [];
	lines.push('Refinery Status:');
	lines.push(`  Queue Size:  ${status.queueSize}`);
	lines.push(`  Testing:     ${status.testing}`);
	lines.push(`  Passed:      ${status.passed}`);
	lines.push(`  Failed:      ${status.failed}`);
	lines.push(`  Merged:      ${status.merged}`);

	return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a refinery instance
 */
async function createRefinery(): Promise<Refinery> {
	const refinery = new Refinery();
	await refinery.init();
	return refinery;
}

/**
 * Handle refinery list command
 */
async function handleRefineryList(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const statusFilter = args.options.status as MergeStatus | undefined;

	const refinery = await createRefinery();
	let mrs: MergeRequest[];

	if (statusFilter) {
		mrs = await refinery.getAllMergeRequests();
		mrs = mrs.filter(mr => mr.status === statusFilter);
	} else {
		mrs = await refinery.getAllMergeRequests();
	}

	console.log(formatMergeRequestList(mrs));
}

/**
 * Handle refinery status command
 */
async function handleRefineryStatus(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const refinery = await createRefinery();
	const status = await refinery.getStatus();

	console.log(formatRefineryStatus(status));
}

/**
 * Handle refinery enqueue command
 */
async function handleRefineryEnqueue(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const branch = args.options.branch as string;
	const author = args.options.author as string;
	const beadId = args.options.beadId as string | undefined;
	const convoyId = args.options.convoyId as string | undefined;

	if (!branch || !author) {
		console.error('Error: Both --branch and --author are required');
		console.error('Usage: refinery enqueue --branch <branch-name> --author <author> [--beadId <bead-id>] [--convoyId <convoy-id>]');
		process.exit(1);
	}

	const refinery = await createRefinery();
	const mr = await refinery.enqueue(branch, author, { beadId, convoyId });

	console.log('Merge request enqueued successfully:');
	console.log(formatMergeRequest(mr, true));
}

/**
 * Handle refinery show command (bonus)
 */
async function handleRefineryShow(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const mrId = args.options.mrId as string;

	if (!mrId) {
		console.error('Error: --mrId is required');
		console.error('Usage: refinery show --mrId <merge-request-id>');
		process.exit(1);
	}

	const refinery = await createRefinery();
	const mr = await refinery.getMergeRequest(mrId);

	if (!mr) {
		console.error(`Error: Merge request not found: ${mrId}`);
		process.exit(1);
	}

	console.log(formatMergeRequest(mr, true));
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Refinery list command
 */
export const refineryListCommand: Command = {
	name: 'refinery list',
	description: 'List merge requests in the queue',
	usage: 'duck refinery list [--status <status>]',
	options: [
		{
			name: 'status',
			type: 'string',
			description: 'Filter by status (pending, testing, passed, failed, merged, cancelled)',
		},
	],
	handler: handleRefineryList,
};

/**
 * Refinery status command
 */
export const refineryStatusCommand: Command = {
	name: 'refinery status',
	description: 'Show refinery status',
	usage: 'duck refinery status',
	options: [],
	handler: handleRefineryStatus,
};

/**
 * Refinery enqueue command
 */
export const refineryEnqueueCommand: Command = {
	name: 'refinery enqueue',
	description: 'Add a merge request to the queue',
	usage: 'duck refinery enqueue --branch <branch-name> --author <author> [--beadId <bead-id>] [--convoyId <convoy-id>]',
	options: [
		{
			name: 'branch',
			type: 'string',
			description: 'Branch name to merge',
			required: true,
		},
		{
			name: 'author',
			type: 'string',
			description: 'Author of the merge request',
			required: true,
		},
		{
			name: 'beadId',
			type: 'string',
			description: 'Associated bead ID (optional)',
		},
		{
			name: 'convoyId',
			type: 'string',
			description: 'Associated convoy ID (optional)',
		},
	],
	handler: handleRefineryEnqueue,
};

/**
 * Refinery show command
 */
export const refineryShowCommand: Command = {
	name: 'refinery show',
	description: 'Show detailed information about a merge request',
	usage: 'duck refinery show --mrId <merge-request-id>',
	options: [
		{
			name: 'mrId',
			type: 'string',
			description: 'Merge request ID',
			required: true,
		},
	],
	handler: handleRefineryShow,
};

/**
 * All refinery commands
 */
export const refineryCommands: Command[] = [
	refineryListCommand,
	refineryStatusCommand,
	refineryEnqueueCommand,
	refineryShowCommand,
];

/**
 * Register all refinery commands to a registry
 */
export function registerRefineryCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of refineryCommands) {
		registry.register(cmd);
	}
}