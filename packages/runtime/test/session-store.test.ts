/**
 * Session Store Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	InMemorySessionStore,
	generateSessionId,
	createSessionData,
	type SessionData,
	type SessionMessage,
} from '../src/session-store.js';

describe('InMemorySessionStore', () => {
	let store: InMemorySessionStore;

	beforeEach(() => {
		store = new InMemorySessionStore({ defaultTTL: 60000 }); // 1 minute
	});

	afterEach(() => {
		store.stop();
	});

	describe('save and load', () => {
		it('should save and load session data', async () => {
			const sessionId = 'test-session-1';
			const sessionData = createSessionData(sessionId, [
				{
					id: 'msg-1',
					role: 'user',
					content: 'Hello',
					timestamp: Date.now(),
				},
			]);

			await store.save(sessionId, sessionData);
			const loaded = await store.load(sessionId);

			expect(loaded).not.toBeNull();
			expect(loaded?.id).toBe(sessionId);
			expect(loaded?.messages).toHaveLength(1);
			expect(loaded?.messages[0].content).toBe('Hello');
		});

		it('should return null for non-existent session', async () => {
			const loaded = await store.load('non-existent');
			expect(loaded).toBeNull();
		});
	});

	describe('delete', () => {
		it('should delete session data', async () => {
			const sessionId = 'test-session-delete';
			const sessionData = createSessionData(sessionId, []);

			await store.save(sessionId, sessionData);
			expect(await store.exists(sessionId)).toBe(true);

			await store.delete(sessionId);
			expect(await store.exists(sessionId)).toBe(false);
		});
	});

	describe('list', () => {
		it('should list all session IDs', async () => {
			await store.save('session-1', createSessionData('session-1', []));
			await store.save('session-2', createSessionData('session-2', []));
			await store.save('session-3', createSessionData('session-3', []));

			const ids = await store.list();
			expect(ids).toContain('session-1');
			expect(ids).toContain('session-2');
			expect(ids).toContain('session-3');
		});

		it('should return empty array when no sessions', async () => {
			const ids = await store.list();
			expect(ids).toHaveLength(0);
		});
	});

	describe('exists', () => {
		it('should return true for existing session', async () => {
			const sessionId = 'test-exists';
			await store.save(sessionId, createSessionData(sessionId, []));
			expect(await store.exists(sessionId)).toBe(true);
		});

		it('should return false for non-existent session', async () => {
			expect(await store.exists('non-existent')).toBe(false);
		});
	});

	describe('TTL expiration', () => {
		it('should expire session after TTL', async () => {
			// Create store with very short TTL
			const shortStore = new InMemorySessionStore({ defaultTTL: 100 });
			const sessionId = 'test-ttl';
			const sessionData = createSessionData(sessionId, []);

			await shortStore.save(sessionId, sessionData);

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Session should be expired
			const loaded = await shortStore.load(sessionId);
			expect(loaded).toBeNull();

			shortStore.stop();
		});

		it('should not expire session with null TTL', async () => {
			// Create store with no expiration
			const noExpiryStore = new InMemorySessionStore({ defaultTTL: null });
			const sessionId = 'test-no-expiry';
			const sessionData = createSessionData(sessionId, []);

			await noExpiryStore.save(sessionId, sessionData);

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Session should still exist
			const loaded = await noExpiryStore.load(sessionId);
			expect(loaded).not.toBeNull();

			noExpiryStore.stop();
		});

		it('should use explicit expiresAt from session data', async () => {
			const sessionId = 'test-explicit-expiry';
			const now = Date.now();
			const sessionData: SessionData = {
				id: sessionId,
				messages: [],
				createdAt: now,
				updatedAt: now,
				expiresAt: now + 100, // 100ms
				metadata: {},
			};

			await store.save(sessionId, sessionData);

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Session should be expired
			const loaded = await store.load(sessionId);
			expect(loaded).toBeNull();
		});
	});

	describe('update existing session', () => {
		it('should update existing session data', async () => {
			const sessionId = 'test-update';
			const sessionData1 = createSessionData(sessionId, [
				{ id: 'msg-1', role: 'user', content: 'First', timestamp: Date.now() },
			]);

			await store.save(sessionId, sessionData1);

			const sessionData2 = createSessionData(sessionId, [
				{ id: 'msg-1', role: 'user', content: 'First', timestamp: Date.now() },
				{ id: 'msg-2', role: 'assistant', content: 'Second', timestamp: Date.now() },
			]);

			await store.save(sessionId, sessionData2);

			const loaded = await store.load(sessionId);
			expect(loaded?.messages).toHaveLength(2);
		});
	});
});

describe('generateSessionId', () => {
	it('should generate unique session IDs', () => {
		const id1 = generateSessionId();
		const id2 = generateSessionId();

		expect(id1).not.toBe(id2);
		expect(id1).toMatch(/^sess_\d+_[a-z0-9]+$/);
	});

	it('should start with sess_ prefix', () => {
		const id = generateSessionId();
		expect(id.startsWith('sess_')).toBe(true);
	});
});

describe('createSessionData', () => {
	it('should create session data with correct structure', () => {
		const id = 'test-session';
		const messages: SessionMessage[] = [
			{ id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
		];

		const sessionData = createSessionData(id, messages, { model: 'claude-3' }, 3600000);

		expect(sessionData.id).toBe(id);
		expect(sessionData.messages).toEqual(messages);
		expect(sessionData.metadata.model).toBe('claude-3');
		expect(sessionData.expiresAt).toBeGreaterThan(Date.now());
	});

	it('should create session data with null TTL', () => {
		const sessionData = createSessionData('id', [], {}, null);

		expect(sessionData.expiresAt).toBeNull();
	});

	it('should create session data without explicit TTL', () => {
		const sessionData = createSessionData('id', []);

		// expiresAt can be null if no TTL is passed
		expect(sessionData.createdAt).toBeDefined();
		expect(sessionData.updatedAt).toBeDefined();
	});
});