/**
 * Mail Store - Persistent mail storage using JSON files
 */

import { exists, mk, read, write, remove, readDir } from '../fs.js';
import type { Mail, MailConfig, MailFilter } from './mail-types.js';

/**
 * Generate unique mail ID
 */
function generateMailId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'msg-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Get inbox path for an agent
 */
function getInboxPath(mailDir: string, agentId: string): string {
  return `${mailDir}/inbox/${agentId}`;
}

/**
 * Get mail file path
 */
function getMailPath(mailDir: string, agentId: string, mailId: string): string {
  return `${mailDir}/inbox/${agentId}/${mailId}.json`;
}

/**
 * MailStore - Manages persistent mail for agents
 */
export class MailStore {
  private mailDir: string;
  private agentId?: string;

  constructor(config?: MailConfig) {
    this.mailDir = config?.mailDir || '.rubberduck/mail';
    this.agentId = config?.agentId;
  }

  /**
   * Initialize mail directory structure
   */
  async init(): Promise<void> {
    const inboxPath = this.agentId
      ? getInboxPath(this.mailDir, this.agentId)
      : `${this.mailDir}/inbox`;

    await mk(inboxPath, { recursive: true });
  }

  /**
   * Send a mail message
   */
  async send(to: string, subject: string, body: string, from?: string): Promise<Mail> {
    const mail: Mail = {
      id: generateMailId(),
      from: from || 'system',
      to,
      subject,
      body,
      read: false,
      createdAt: Date.now(),
    };

    const mailPath = getMailPath(this.mailDir, to, mail.id);
    await write(mailPath, JSON.stringify(mail, null, 2));

    return mail;
  }

  /**
   * Get messages for an agent's inbox
   */
  async inbox(agentId: string, filter?: MailFilter): Promise<Mail[]> {
    const inboxPath = getInboxPath(this.mailDir, agentId);

    if (!(await exists(inboxPath))) {
      return [];
    }

    const files = await readDir(inboxPath);
    const messages: Mail[] = [];

    for (const file of files) {
      // Handle both string and FileInfo return types
      const fileName = typeof file === 'string' ? file : file.name;
      if (!fileName.endsWith('.json')) continue;

      try {
        const content = await read(`${inboxPath}/${fileName}`);
        const mail = JSON.parse(content.toString()) as Mail;

        // Apply filters
        if (filter?.from && mail.from !== filter.from) continue;
        if (filter?.subject && !mail.subject.includes(filter.subject)) continue;
        if (!filter?.includeRead && mail.read) continue;

        messages.push(mail);
      } catch {
        // Skip invalid files
      }
    }

    // Sort by creation time (newest first)
    return messages.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get unread message count for an agent
   */
  async unreadCount(agentId: string): Promise<number> {
    const messages = await this.inbox(agentId);
    return messages.filter(m => !m.read).length;
  }

  /**
   * Read a specific message
   */
  async read(mailId: string, agentId?: string): Promise<Mail | null> {
    // If agentId provided, look in specific inbox
    if (agentId) {
      const mailPath = getMailPath(this.mailDir, agentId, mailId);
      if (await exists(mailPath)) {
        const content = await read(mailPath);
        return JSON.parse(content.toString()) as Mail;
      }
      return null;
    }

    // Search all inboxes
    const inboxDir = `${this.mailDir}/inbox`;
    if (!(await exists(inboxDir))) {
      return null;
    }

    const agents = await readDir(inboxDir);
    for (const agent of agents) {
      const agentId = typeof agent === 'string' ? agent : agent.name;
      const mailPath = getMailPath(this.mailDir, agentId, mailId);
      if (await exists(mailPath)) {
        const content = await read(mailPath);
        return JSON.parse(content.toString()) as Mail;
      }
    }

    return null;
  }

  /**
   * Mark a message as read
   */
  async markRead(mailId: string, agentId: string): Promise<boolean> {
    const mailPath = getMailPath(this.mailDir, agentId, mailId);

    if (!(await exists(mailPath))) {
      return false;
    }

    const content = await read(mailPath);
    const mail = JSON.parse(content.toString()) as Mail;

    mail.read = true;
    mail.readAt = Date.now();

    await write(mailPath, JSON.stringify(mail, null, 2));
    return true;
  }

  /**
   * Delete a message
   */
  async delete(mailId: string, agentId: string): Promise<boolean> {
    const mailPath = getMailPath(this.mailDir, agentId, mailId);

    if (!(await exists(mailPath))) {
      return false;
    }

    await remove(mailPath);
    return true;
  }

  /**
   * Delete all read messages for an agent
   */
  async deleteRead(agentId: string): Promise<number> {
    const messages = await this.inbox(agentId, { includeRead: true });
    let count = 0;

    for (const mail of messages) {
      if (mail.read) {
        await this.delete(mail.id, agentId);
        count++;
      }
    }

    return count;
  }

  /**
   * Send message to multiple recipients
   */
  async broadcast(to: string[], subject: string, body: string, from?: string): Promise<Mail[]> {
    const results: Mail[] = [];

    for (const recipient of to) {
      const mail = await this.send(recipient, subject, body, from);
      results.push(mail);
    }

    return results;
  }
}

/**
 * Create a MailStore instance
 */
export function createMailStore(config?: MailConfig): MailStore {
  return new MailStore(config);
}

/**
 * In-memory mail store for testing
 */
class InMemoryMailStore {
  private messages = new Map<string, Mail[]>();

  async send(to: string, subject: string, body: string, from?: string): Promise<Mail> {
    const mail: Mail = {
      id: generateMailId(),
      from: from || 'system',
      to,
      subject,
      body,
      read: false,
      createdAt: Date.now(),
    };

    if (!this.messages.has(to)) {
      this.messages.set(to, []);
    }
    this.messages.get(to)!.push(mail);

    return mail;
  }

  async inbox(agentId: string): Promise<Mail[]> {
    return this.messages.get(agentId) || [];
  }

  async unreadCount(agentId: string): Promise<number> {
    const msgs = this.messages.get(agentId) || [];
    return msgs.filter(m => !m.read).length;
  }

  async read(mailId: string, agentId?: string): Promise<Mail | null> {
    if (agentId) {
      const msgs = this.messages.get(agentId) || [];
      return msgs.find(m => m.id === mailId) || null;
    }

    for (const msgs of this.messages.values()) {
      const mail = msgs.find(m => m.id === mailId);
      if (mail) return mail;
    }
    return null;
  }

  async markRead(mailId: string, agentId: string): Promise<boolean> {
    const msgs = this.messages.get(agentId);
    if (!msgs) return false;

    const mail = msgs.find(m => m.id === mailId);
    if (!mail) return false;

    mail.read = true;
    mail.readAt = Date.now();
    return true;
  }

  async delete(mailId: string, agentId: string): Promise<boolean> {
    const msgs = this.messages.get(agentId);
    if (!msgs) return false;

    const idx = msgs.findIndex(m => m.id === mailId);
    if (idx === -1) return false;

    msgs.splice(idx, 1);
    return true;
  }

  async deleteRead(agentId: string): Promise<number> {
    const msgs = this.messages.get(agentId) || [];
    let count = 0;

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].read) {
        msgs.splice(i, 1);
        count++;
      }
    }

    return count;
  }

  async broadcast(to: string[], subject: string, body: string, from?: string): Promise<Mail[]> {
    const results: Mail[] = [];
    for (const recipient of to) {
      const mail = await this.send(recipient, subject, body, from);
      results.push(mail);
    }
    return results;
  }
}

/**
 * Create an in-memory mail store for testing
 */
export function createInMemoryMailStore(): MailStore {
  return new InMemoryMailStore() as unknown as MailStore;
}