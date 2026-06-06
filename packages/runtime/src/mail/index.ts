/**
 * Mail Module - Persistent agent messaging
 * 
 * Provides persistent mail system for agent-to-agent communication.
 * Messages survive session restarts and can be checked on startup.
 */

export { MailStore, createMailStore, createInMemoryMailStore } from './mail-store.js';
export type { Mail, MailConfig, MailFilter } from './mail-types.js';

/**
 * Quick example:
 * 
 * ```typescript
 * import { createMailStore } from '@rubberduck/runtime';
 * 
 * const mail = createMailStore({ agentId: 'orchestrator' });
 * await mail.init();
 * 
 * // Send message
 * await mail.send('coder', 'Task complete', 'PR #42 is ready for review');
 * 
 * // Check inbox
 * const messages = await mail.inbox('coder');
 * for (const msg of messages) {
 *   console.log(`${msg.from}: ${msg.subject}`);
 * }
 * ```
 */