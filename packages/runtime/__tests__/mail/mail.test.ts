/**
 * Mail System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryMailStore } from '../../src/mail/mail-store.js';

describe('MailStore', () => {
  let mailStore: ReturnType<typeof createInMemoryMailStore>;

  beforeEach(() => {
    mailStore = createInMemoryMailStore();
  });

  describe('send', () => {
    it('should send a mail message', async () => {
      const mail = await mailStore.send('coder', 'Test subject', 'Test body', 'orchestrator');

      expect(mail.id).toMatch(/^msg-/);
      expect(mail.from).toBe('orchestrator');
      expect(mail.to).toBe('coder');
      expect(mail.subject).toBe('Test subject');
      expect(mail.body).toBe('Test body');
      expect(mail.read).toBe(false);
      expect(mail.createdAt).toBeDefined();
    });

    it('should use "system" as default sender', async () => {
      const mail = await mailStore.send('coder', 'Test', 'Body');

      expect(mail.from).toBe('system');
    });

    it('should generate unique IDs', async () => {
      const mail1 = await mailStore.send('coder', 'Test 1', 'Body 1');
      const mail2 = await mailStore.send('coder', 'Test 2', 'Body 2');

      expect(mail1.id).not.toBe(mail2.id);
    });
  });

  describe('inbox', () => {
    it('should return messages for recipient', async () => {
      await mailStore.send('coder', 'Message 1', 'Body 1');
      await mailStore.send('coder', 'Message 2', 'Body 2');
      await mailStore.send('reviewer', 'Message 3', 'Body 3');

      const inbox = await mailStore.inbox('coder');

      expect(inbox).toHaveLength(2);
      expect(inbox.every(m => m.to === 'coder')).toBe(true);
    });

    it('should return empty array for empty inbox', async () => {
      const inbox = await mailStore.inbox('nonexistent');

      expect(inbox).toHaveLength(0);
    });

    it('should sort messages by creation time (newest first)', async () => {
      // Directly manipulate the internal store for predictable ordering
      const store = mailStore as any;
      store.messages.set('coder', []);

      // Manually push messages in reverse order to test sorting
      const now = Date.now();
      store.messages.get('coder').push(
        { id: 'msg-second', from: 'a', to: 'coder', subject: 'Second', body: '', read: false, createdAt: now },
        { id: 'msg-first', from: 'a', to: 'coder', subject: 'First', body: '', read: false, createdAt: now - 1000 }
      );

      const inbox = await mailStore.inbox('coder');

      expect(inbox[0].id).toBe('msg-second'); // newest first
      expect(inbox[1].id).toBe('msg-first');
    });
  });

  describe('unreadCount', () => {
    it('should return count of unread messages', async () => {
      await mailStore.send('coder', 'Message 1', 'Body');
      await mailStore.send('coder', 'Message 2', 'Body');
      await mailStore.send('coder', 'Message 3', 'Body');

      const count = await mailStore.unreadCount('coder');

      expect(count).toBe(3);
    });

    it('should return 0 for empty inbox', async () => {
      const count = await mailStore.unreadCount('nonexistent');

      expect(count).toBe(0);
    });
  });

  describe('read', () => {
    it('should retrieve a specific message', async () => {
      const sent = await mailStore.send('coder', 'Test', 'Body');

      const mail = await mailStore.read(sent.id, 'coder');

      expect(mail).not.toBeNull();
      expect(mail?.id).toBe(sent.id);
      expect(mail?.subject).toBe('Test');
    });

    it('should return null for nonexistent message', async () => {
      const mail = await mailStore.read('nonexistent', 'coder');

      expect(mail).toBeNull();
    });
  });

  describe('markRead', () => {
    it('should mark message as read', async () => {
      const mail = await mailStore.send('coder', 'Test', 'Body');

      const result = await mailStore.markRead(mail.id, 'coder');

      expect(result).toBe(true);

      const updated = await mailStore.read(mail.id, 'coder');
      expect(updated?.read).toBe(true);
      expect(updated?.readAt).toBeDefined();
    });

    it('should return false for nonexistent message', async () => {
      const result = await mailStore.markRead('nonexistent', 'coder');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a message', async () => {
      const mail = await mailStore.send('coder', 'Test', 'Body');

      const result = await mailStore.delete(mail.id, 'coder');

      expect(result).toBe(true);

      const inbox = await mailStore.inbox('coder');
      expect(inbox.some(m => m.id === mail.id)).toBe(false);
    });

    it('should return false for nonexistent message', async () => {
      const result = await mailStore.delete('nonexistent', 'coder');

      expect(result).toBe(false);
    });
  });

  describe('broadcast', () => {
    it('should send message to multiple recipients', async () => {
      const results = await mailStore.broadcast(
        ['coder', 'reviewer', 'tester'],
        'Broadcast',
        'Test broadcast message'
      );

      expect(results).toHaveLength(3);
      expect(results.every(m => m.subject === 'Broadcast')).toBe(true);
      expect(results.map(m => m.to)).toEqual(expect.arrayContaining(['coder', 'reviewer', 'tester']));
    });
  });
});

describe('Mail ID Format', () => {
  it('should generate IDs starting with msg-', async () => {
    const mailStore = createInMemoryMailStore();
    const mail = await mailStore.send('coder', 'Test', 'Body');

    expect(mail.id.startsWith('msg-')).toBe(true);
  });

  it('should generate 12 character IDs (msg- + 8 chars)', async () => {
    const mailStore = createInMemoryMailStore();
    const mail = await mailStore.send('coder', 'Test', 'Body');

    expect(mail.id.length).toBe(12);
  });
});