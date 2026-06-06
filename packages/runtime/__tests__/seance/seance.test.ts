/**
 * Seance Tests
 * Tests for the session discovery and recovery system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Seance } from '../../src/recovery/seance.js';
import type { SessionEvent, SessionRecord } from '../../src/recovery/seance-types.js';

describe('Seance', () => {
	let seance: Seance;
	const testDir = '.rubberduck/test-sessions-' + Date.now();

	beforeEach(async () => {
		seance = new Seance({
			storageDir: testDir,
			maxEventsPerSession: 100,
			retentionDays: 30,
		});
		await seance.init();
		await seance.clear();
	});

	afterEach(async () => {
		// Cleanup handled by unique directory per test run
	});

	describe('createSession', () => {
		it('should create a new session', async () => {
			const session = await seance.createSession('agent-1', {
				workBeads: ['rd-task1'],
			});

			expect(session.id).toMatch(/^session-/);
			expect(session.agentId).toBe('agent-1');
			expect(session.status).toBe('active');
			expect(session.workBeads).toEqual(['rd-task1']);
		});

		it('should auto-generate ID', async () => {
			const session = await seance.createSession('agent-1');
			expect(session.id).toMatch(/^session-[a-z0-9]{5}$/);
		});
	});

	describe('logEvent', () => {
		it('should log an event to a session', async () => {
			const session = await seance.createSession('agent-1');
			
			const event: SessionEvent = {
				type: 'prompt',
				timestamp: Date.now(),
				data: { text: 'Hello' },
			};

			await seance.logEvent(session.id, event);

			const events = await seance.getEvents(session.id);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('prompt');
		});

		it('should update lastEventAt', async () => {
			const session = await seance.createSession('agent-1');
			const before = session.lastEventAt;

			const event: SessionEvent = {
				type: 'tool',
				timestamp: Date.now(),
				data: { tool: 'shell' },
			};

			await seance.logEvent(session.id, event);

			const updated = await seance.getSession(session.id);
			expect(updated!.lastEventAt).toBeGreaterThanOrEqual(before);
		});

		it('should throw for non-existent session', async () => {
			const event: SessionEvent = {
				type: 'start',
				timestamp: Date.now(),
				data: {},
			};

			await expect(
				seance.logEvent('session-nonexistent', event)
			).rejects.toThrow('not found');
		});
	});

	describe('checkpoint', () => {
		it('should log a checkpoint event', async () => {
			const session = await seance.createSession('agent-1');
			
			await seance.checkpoint(session.id, { progress: 50 });

			const events = await seance.getEvents(session.id);
			const checkpoint = events.find(e => e.type === 'checkpoint');
			expect(checkpoint).toBeDefined();
			expect((checkpoint!.data as any).progress).toBe(50);
		});
	});

	describe('discover', () => {
		it('should find previous sessions for an agent', async () => {
			const s1 = await seance.createSession('agent-1');
			const s2 = await seance.createSession('agent-1');
			await seance.createSession('agent-2');

			const sessions = await seance.discover('agent-1');
			expect(sessions).toHaveLength(2);
			expect(sessions.map(s => s.id)).toContain(s1.id);
			expect(sessions.map(s => s.id)).toContain(s2.id);
		});

		it('should filter by status', async () => {
			const s1 = await seance.createSession('agent-1');
			await seance.createSession('agent-1');
			await seance.endSession(s1.id, 'completed');

			const active = await seance.discover('agent-1', { status: 'active' });
			expect(active).toHaveLength(1);
		});

		it('should limit results', async () => {
			await seance.createSession('agent-1');
			await seance.createSession('agent-1');
			await seance.createSession('agent-1');

			const sessions = await seance.discover('agent-1', { limit: 2 });
			expect(sessions).toHaveLength(2);
		});
	});

	describe('talk', () => {
		it('should answer questions about the session', async () => {
			const session = await seance.createSession('agent-1', {
				workBeads: ['rd-task1', 'rd-task2'],
			});

			const answer = await seance.talk(session.id, 'What work did you do?');
			expect(answer).toContain('rd-task1');
			expect(answer).toContain('rd-task2');
		});

		it('should answer duration questions', async () => {
			const session = await seance.createSession('agent-1');
			const answer = await seance.talk(session.id, 'How long did you run?');
			expect(answer).toContain('session');
		});

		it('should throw for non-existent session', async () => {
			await expect(
				seance.talk('session-nonexistent', 'What?')
			).rejects.toThrow('not found');
		});
	});

	describe('ask', () => {
		it('should be an alias for talk', async () => {
			const session = await seance.createSession('agent-1');
			const answer = await seance.ask(session.id, 'What events did you have?');
			expect(answer).toBeDefined();
		});
	});

	describe('getEvents', () => {
		it('should return all events from a session', async () => {
			const session = await seance.createSession('agent-1');
			
			await seance.logEvent(session.id, { type: 'start', timestamp: Date.now(), data: {} });
			await seance.logEvent(session.id, { type: 'prompt', timestamp: Date.now(), data: {} });
			await seance.logEvent(session.id, { type: 'complete', timestamp: Date.now(), data: {} });

			const events = await seance.getEvents(session.id);
			expect(events).toHaveLength(3);
		});
	});

	describe('endSession', () => {
		it('should end a session with completed status', async () => {
			const session = await seance.createSession('agent-1');
			
			await seance.endSession(session.id, 'completed');

			const updated = await seance.getSession(session.id);
			expect(updated?.status).toBe('completed');
			expect(updated?.endedAt).toBeDefined();
		});

		it('should end a session with failed status', async () => {
			const session = await seance.createSession('agent-1');
			
			await seance.endSession(session.id, 'failed');

			const updated = await seance.getSession(session.id);
			expect(updated?.status).toBe('failed');
		});

		it('should log a complete event', async () => {
			const session = await seance.createSession('agent-1');
			
			await seance.endSession(session.id, 'completed');

			const events = await seance.getEvents(session.id);
			const complete = events.find(e => e.type === 'complete');
			expect(complete).toBeDefined();
		});
	});

	describe('getSession', () => {
		it('should return a session by ID', async () => {
			const session = await seance.createSession('agent-1');
			const found = await seance.getSession(session.id);
			
			expect(found?.id).toBe(session.id);
		});

		it('should return null for non-existent session', async () => {
			const found = await seance.getSession('session-nonexistent');
			expect(found).toBeNull();
		});
	});

	describe('query', () => {
		it('should query sessions by agent', async () => {
			await seance.createSession('agent-1');
			await seance.createSession('agent-1');
			await seance.createSession('agent-2');

			const sessions = await seance.query({ agentId: 'agent-1' });
			expect(sessions).toHaveLength(2);
		});

		it('should query sessions by bead', async () => {
			await seance.createSession('agent-1', { workBeads: ['rd-task1'] });
			await seance.createSession('agent-2', { workBeads: ['rd-task2'] });

			const sessions = await seance.query({ beadId: 'rd-task1' });
			expect(sessions).toHaveLength(1);
			expect(sessions[0].workBeads).toContain('rd-task1');
		});

		it('should query with limit and sort', async () => {
			await seance.createSession('agent-1');
			await seance.createSession('agent-1');
			await seance.createSession('agent-1');

			const sessions = await seance.query({
				agentId: 'agent-1',
				limit: 2,
				sort: 'asc',
			});
			expect(sessions).toHaveLength(2);
		});
	});

	describe('getStats', () => {
		it('should return session statistics', async () => {
			const s1 = await seance.createSession('agent-1');
			await seance.createSession('agent-2');
			await seance.endSession(s1.id, 'completed');

			const stats = await seance.getStats();
			expect(stats.total).toBe(2);
			expect(stats.active).toBe(1);
			expect(stats.completed).toBe(1);
		});
	});
});