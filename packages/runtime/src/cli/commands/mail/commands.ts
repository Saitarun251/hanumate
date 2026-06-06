/**
 * Mail Commands - CLI command handlers for mail operations
 *
 * Provides handlers for:
 * - mail send: Send a message to an agent
 * - mail inbox: List messages in the inbox
 * - mail read: Read a specific message
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import type { Mail, MailFilter } from '../../../mail/mail-types.js';
import { MailStore } from '../../../mail/mail-store.js';

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format a mail message for CLI output
 */
export function formatMail(mail: Mail, verbose = false): string {
	const readStatus = mail.read ? '\x1b[90m(read)\x1b[0m' : '\x1b[33m(unread)\x1b[0m';

	if (verbose) {
		const lines: string[] = [];
		lines.push(`Message: ${mail.id} ${readStatus}`);
		lines.push(`  From:    ${mail.from}`);
		lines.push(`  To:      ${mail.to}`);
		lines.push(`  Subject: ${mail.subject}`);
		lines.push(`  Sent:    ${new Date(mail.createdAt).toISOString()}`);

		if (mail.readAt) {
			lines.push(`  Read:    ${new Date(mail.readAt).toISOString()}`);
		}

		lines.push('');
		lines.push('Body:');
		const bodyLines = mail.body.split('\n');
		for (const line of bodyLines) {
			lines.push(`  ${line}`);
		}

		return lines.join('\n');
	}

	const shortDate = new Date(mail.createdAt).toISOString().slice(0, 10);
	const subject = mail.subject.length > 50 ? mail.subject.slice(0, 47) + '...' : mail.subject;
	return `[${shortDate}] ${mail.from} → ${mail.to}: ${subject} ${readStatus}`;
}

/**
 * Format a list of mail messages for CLI output
 */
export function formatMailList(mails: Mail[], showHeaders = true): string {
	if (mails.length === 0) {
		return 'No messages found';
	}

	const lines: string[] = [];

	if (showHeaders) {
		const unreadCount = mails.filter(m => !m.read).length;
		if (unreadCount > 0) {
			lines.push(`Found ${mails.length} message(s) (${unreadCount} unread):`);
		} else {
			lines.push(`Found ${mails.length} message(s):`);
		}
		lines.push('');
	}

	for (const mail of mails) {
		lines.push(formatMail(mail, false));
	}

	return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Create a mail store instance
 */
function createMailStore(): MailStore {
	return new MailStore();
}

/**
 * Handle mail send command
 */
async function handleMailSend(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const to = args.options.to as string;
	const subject = args.options.subject as string;
	const body = args.options.body as string;
	const from = args.options.from as string | undefined;

	if (!to || !subject || !body) {
		console.error('Error: --to, --subject, and --body are required');
		console.error('Usage: mail send --to <agent-id> --subject "<subject>" --body "<message>" [--from <agent-id>]');
		process.exit(1);
	}

	const store = createMailStore();
	await store.init();

	const mail = await store.send(to, subject, body, from);

	console.log('Message sent successfully:');
	console.log(formatMail(mail, true));
}

/**
 * Handle mail inbox command
 */
async function handleMailInbox(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const agentId = args.options.agentId as string;
	const fromFilter = args.options.from as string | undefined;
	const subjectFilter = args.options.subject as string | undefined;
	const includeRead = args.options.includeRead === undefined ? true : args.options.includeRead === 'true';

	if (!agentId) {
		console.error('Error: --agentId is required');
		console.error('Usage: mail inbox --agentId <agent-id> [--from <sender>] [--subject <keyword>] [--includeRead <true|false>]');
		process.exit(1);
	}

	const store = createMailStore();
	await store.init();

	const filter: MailFilter = {
		includeRead,
	};
	if (fromFilter) filter.from = fromFilter;
	if (subjectFilter) filter.subject = subjectFilter;

	const mails = await store.inbox(agentId, filter);

	console.log(formatMailList(mails));
}

/**
 * Handle mail read command
 */
async function handleMailRead(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const mailId = args.options.mailId as string;
	const agentId = args.options.agentId as string | undefined;

	if (!mailId) {
		console.error('Error: --mailId is required');
		console.error('Usage: mail read --mailId <message-id> [--agentId <agent-id>]');
		process.exit(1);
	}

	const store = createMailStore();
	await store.init();

	const mail = await store.read(mailId, agentId);

	if (!mail) {
		console.error(`Error: Message not found: ${mailId}`);
		process.exit(1);
	}

	// Mark as read
	if (agentId) {
		await store.markRead(mailId, agentId);
	}

	console.log(formatMail(mail, true));
}

/**
 * Handle mail count command (bonus)
 */
async function handleMailCount(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	const agentId = args.options.agentId as string;

	if (!agentId) {
		console.error('Error: --agentId is required');
		console.error('Usage: mail count --agentId <agent-id>');
		process.exit(1);
	}

	const store = createMailStore();
	await store.init();

	const unreadCount = await store.unreadCount(agentId);

	if (unreadCount > 0) {
		console.log(`\x1b[33m${unreadCount}\x1b[0m unread message(s) for ${agentId}`);
	} else {
		console.log(`No unread messages for ${agentId}`);
	}
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Mail send command
 */
export const mailSendCommand: Command = {
	name: 'mail send',
	description: 'Send a message to an agent',
	usage: 'duck mail send --to <agent-id> --subject "<subject>" --body "<message>" [--from <agent-id>]',
	options: [
		{
			name: 'to',
			type: 'string',
			description: 'Recipient agent ID',
			required: true,
		},
		{
			name: 'subject',
			type: 'string',
			description: 'Message subject',
			required: true,
		},
		{
			name: 'body',
			type: 'string',
			description: 'Message body',
			required: true,
		},
		{
			name: 'from',
			type: 'string',
			description: 'Sender agent ID (default: system)',
		},
	],
	handler: handleMailSend,
};

/**
 * Mail inbox command
 */
export const mailInboxCommand: Command = {
	name: 'mail inbox',
	description: 'List messages in the inbox',
	usage: 'duck mail inbox --agentId <agent-id> [--from <sender>] [--subject <keyword>] [--includeRead <true|false>]',
	options: [
		{
			name: 'agentId',
			type: 'string',
			description: 'Agent ID to check inbox for',
			required: true,
		},
		{
			name: 'from',
			type: 'string',
			description: 'Filter by sender',
		},
		{
			name: 'subject',
			type: 'string',
			description: 'Filter by subject keyword',
		},
		{
			name: 'includeRead',
			type: 'string',
			description: 'Include read messages (true/false, default: true)',
		},
	],
	handler: handleMailInbox,
};

/**
 * Mail read command
 */
export const mailReadCommand: Command = {
	name: 'mail read',
	description: 'Read a specific message',
	usage: 'duck mail read --mailId <message-id> [--agentId <agent-id>]',
	options: [
		{
			name: 'mailId',
			type: 'string',
			description: 'Message ID to read',
			required: true,
		},
		{
			name: 'agentId',
			type: 'string',
			description: 'Agent ID (for marking as read)',
		},
	],
	handler: handleMailRead,
};

/**
 * Mail count command
 */
export const mailCountCommand: Command = {
	name: 'mail count',
	description: 'Count unread messages in inbox',
	usage: 'duck mail count --agentId <agent-id>',
	options: [
		{
			name: 'agentId',
			type: 'string',
			description: 'Agent ID to check',
			required: true,
		},
	],
	handler: handleMailCount,
};

/**
 * All mail commands
 */
export const mailCommands: Command[] = [
	mailSendCommand,
	mailInboxCommand,
	mailReadCommand,
	mailCountCommand,
];

/**
 * Register all mail commands to a registry
 */
export function registerMailCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of mailCommands) {
		registry.register(cmd);
	}
}