/**
 * Session Commands - CLI command handlers for session operations
 *
 * Provides handlers for:
 * - session list: List all sessions
 * - session show: Show detailed information about a session
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { SessionData, SessionMetadata } from '../../../session-store.js';
import { InMemorySessionStore } from '../../../session-store.js';

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format session metadata for CLI output
 */
function formatMetadata(meta: SessionMetadata): string {
	const lines: string[] = [];

	if (meta.model) {
		lines.push(`  Model:     ${meta.model}`);
	}
	if (meta.userId) {
		lines.push(`  User:      ${meta.userId}`);
	}
	if (meta.agentId) {
		lines.push(`  Agent:     ${meta.agentId}`);
	}
	if (meta.skills && meta.skills.length > 0) {
		lines.push(`  Skills:    ${meta.skills.join(', ')}`);
	}
	if (meta.tags && meta.tags.length > 0) {
		lines.push(`  Tags:      ${meta.tags.join(', ')}`);
	}

	return lines.join('\n');
}

/**
 * Format a session for CLI output
 */
export function formatSession(session: SessionData, verbose = false): string {
	const now = Date.now();
	const age = Math.floor((now - session.createdAt) / 1000);
	const ageStr = age < 60 ? `${age}s ago` :
		age < 3600 ? `${Math.floor(age / 60)}m ago` :
		age < 86400 ? `${Math.floor(age / 3600)}h ago` :
		`${Math.floor(age / 86400)}d ago`;

	if (verbose) {
		const lines: string[] = [];
		lines.push(`Session: ${session.id}`);
		lines.push(`  Created:    ${new Date(session.createdAt).toISOString()}`);
		lines.push(`  Updated:    ${new Date(session.updatedAt).toISOString()}`);
		lines.push(`  Age:        ${ageStr}`);
		lines.push(`  Messages:   ${session.messages.length}`);

		if (session.expiresAt) {
			const ttl = Math.max(0, Math.floor((session.expiresAt - now) / 1000));
			const ttlStr = ttl < 60 ? `${ttl}s` :
				ttl < 3600 ? `${Math.floor(ttl / 60)}m` :
				ttl < 86400 ? `${Math.floor(ttl / 3600)}h` :
				`${Math.floor(ttl / 86400)}d`;
			lines.push(`  TTL:        ${ttlStr}`);
		}

		if (session.metadata) {
			lines.push('');
			lines.push('  Metadata:');
			lines.push(formatMetadata(session.metadata));
		}

		if (session.messages.length > 0) {
			lines.push('');
			lines.push('  Recent Messages:');
			const recentMsgs = session.messages.slice(-3);
			for (const msg of recentMsgs) {
				const preview = msg.content.slice(0, 80).replace(/\n/g, ' ');
				const previewStr = preview.length === 80 ? preview + '...' : preview;
				lines.push(`    [${msg.role}] ${previewStr}`);
			}
		}

		return lines.join('\n');
	}

	const msgCount = session.messages.length;
	const meta = session.metadata;
	const agentInfo = meta?.agentId || meta?.userId || 'unknown';

	return `${session.id} (${agentInfo}) - ${msgCount} messages, ${ageStr}`;
}

/**
 * Format a list of sessions for CLI output
 */
export function formatSessionList(sessions: SessionData[], showHeaders = true): string {
	if (sessions.length === 0) {
		return 'No sessions found';
	}

	const lines: string[] = [];

	if (showHeaders) {
		lines.push(`Found ${sessions.length} session(s):`);
		lines.push('');
	}

	for (const session of sessions) {
		lines.push(formatSession(session, false));
	}

	return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a session store instance
 */
function createSessionStore(): InMemorySessionStore {
	return new InMemorySessionStore({ autoCleanup: false });
}

/**
 * Handle session list command
 */
async function handleSessionList(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const store = createSessionStore();
	const sessionIds = await store.list();

	if (sessionIds.length === 0) {
		console.log('No sessions found');
		return;
	}

	const sessions: SessionData[] = [];
	for (const id of sessionIds) {
		const session = await store.load(id);
		if (session) {
			sessions.push(session);
		}
	}

	// Sort by updatedAt descending (newest first)
	sessions.sort((a, b) => b.updatedAt - a.updatedAt);

	console.log(formatSessionList(sessions));
}

/**
 * Handle session show command
 */
async function handleSessionShow(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const sessionId = args.args[0];

	if (!sessionId) {
		console.error('Error: Session ID is required');
		console.error('Usage: session show <session-id>');
		process.exit(1);
	}

	const store = createSessionStore();
	const session = await store.load(sessionId);

	if (!session) {
		console.error(`Error: Session not found: ${sessionId}`);
		process.exit(1);
	}

	console.log(formatSession(session, true));
}

/**
 * Handle session stats command (bonus)
 */
async function handleSessionStats(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const store = createSessionStore();
	const sessionIds = await store.list();

	let totalMessages = 0;
	let oldestSession: SessionData | null = null;
	let newestSession: SessionData | null = null;

	for (const id of sessionIds) {
		const session = await store.load(id);
		if (session) {
			totalMessages += session.messages.length;
			if (!oldestSession || session.createdAt < oldestSession.createdAt) {
				oldestSession = session;
			}
			if (!newestSession || session.createdAt > newestSession.createdAt) {
				newestSession = session;
			}
		}
	}

	console.log('Session Statistics:');
	console.log(`  Total Sessions:  ${sessionIds.length}`);
	console.log(`  Total Messages: ${totalMessages}`);

	if (oldestSession) {
		console.log(`  Oldest Session:  ${oldestSession.id} (${new Date(oldestSession.createdAt).toISOString()})`);
	}
	if (newestSession) {
		console.log(`  Newest Session:  ${newestSession.id} (${new Date(newestSession.createdAt).toISOString()})`);
	}
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Session list command
 */
export const sessionListCommand: Command = {
	name: 'session list',
	description: 'List all sessions',
	usage: 'duck session list',
	options: [],
	handler: handleSessionList,
};

/**
 * Session show command
 */
export const sessionShowCommand: Command = {
	name: 'session show',
	description: 'Show detailed information about a session',
	usage: 'duck session show <session-id>',
	options: [],
	handler: handleSessionShow,
};

/**
 * Session stats command
 */
export const sessionStatsCommand: Command = {
	name: 'session stats',
	description: 'Show session statistics',
	usage: 'duck session stats',
	options: [],
	handler: handleSessionStats,
};

/**
 * All session commands
 */
export const sessionCommands: Command[] = [
	sessionListCommand,
	sessionShowCommand,
	sessionStatsCommand,
];

/**
 * Register all session commands to a registry
 */
export function registerSessionCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of sessionCommands) {
		registry.register(cmd);
	}
}