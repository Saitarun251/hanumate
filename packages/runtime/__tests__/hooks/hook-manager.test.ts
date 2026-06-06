/**
 * Hook Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookManager } from '../../src/hooks/hook-manager.ts';
import { InMemoryHookStore } from '../../src/hooks/hook-store.ts';
import type { Hook } from '../../src/hooks/hook-types.ts';

describe('HookManager', () => {
	let store: InMemoryHookStore;
	let manager: HookManager;

	beforeEach(() => {
		store = new InMemoryHookStore();
		manager = new HookManager({ store });
	});

	describe('createHook', () => {
		it('should create and save a new hook', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			expect(hook.id).toMatch(/^hook_/);
			expect(hook.agentId).toBe('agent-1');
			expect(hook.beadId).toBe('bead-123');
			expect(hook.status).toBe('pending');

			// Verify it was saved
			const loaded = await store.load(hook.id);
			expect(loaded).not.toBeNull();
		});

		it('should allow custom initial status', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			expect(hook.status).toBe('active');
		});
	});

	describe('getHook', () => {
		it('should retrieve hook by ID', async () => {
			const created = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			const loaded = await manager.getHook(created.id);
			expect(loaded).not.toBeNull();
			expect(loaded?.id).toBe(created.id);
		});

		it('should return null for non-existent hook', async () => {
			const loaded = await manager.getHook('non-existent');
			expect(loaded).toBeNull();
		});
	});

	describe('getAgentHook', () => {
		it('should find hook for agent', async () => {
			await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			const hook = await manager.getAgentHook('agent-1');
			expect(hook).not.toBeNull();
			expect(hook?.agentId).toBe('agent-1');
		});

		it('should return null for agent without hook', async () => {
			const hook = await manager.getAgentHook('non-existent-agent');
			expect(hook).toBeNull();
		});
	});

	describe('claimWork (GUPP)', () => {
		it('should claim pending work for agent', async () => {
			await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			const claimed = await manager.claimWork('agent-1');

			expect(claimed).not.toBeNull();
			expect(claimed?.status).toBe('active');
			expect(claimed?.startedAt).toBeDefined();
		});

		it('should return null when no work available', async () => {
			const claimed = await manager.claimWork('agent-with-no-work');
			expect(claimed).toBeNull();
		});

		it('should not claim work already claimed', async () => {
			await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			const first = await manager.claimWork('agent-1');
			const second = await manager.claimWork('agent-1');

			expect(first).not.toBeNull();
			expect(second).toBeNull();
		});
	});

	describe('startWork', () => {
		it('should start work on pending hook', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			await manager.startWork(hook.id);

			const updated = await manager.getHook(hook.id);
			expect(updated?.status).toBe('active');
			expect(updated?.startedAt).toBeDefined();
		});

		it('should throw for non-existent hook', async () => {
			await expect(manager.startWork('non-existent')).rejects.toThrow('Hook not found');
		});

		it('should throw for non-pending hook', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			await expect(manager.startWork(hook.id)).rejects.toThrow('not in pending status');
		});
	});

	describe('completeWork', () => {
		it('should mark hook as completed', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			await manager.completeWork(hook.id);

			const updated = await manager.getHook(hook.id);
			expect(updated?.status).toBe('completed');
			expect(updated?.completedAt).toBeDefined();
			expect(updated?.progress).toBe(100);
		});
	});

	describe('stall', () => {
		it('should mark hook as stalled', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			await manager.stall(hook.id);

			const updated = await manager.getHook(hook.id);
			expect(updated?.status).toBe('stalled');
		});
	});

	describe('release', () => {
		it('should return hook to pending status', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			await manager.release(hook.id);

			const updated = await manager.getHook(hook.id);
			expect(updated?.status).toBe('pending');
			expect(updated?.startedAt).toBeUndefined();
		});
	});

	describe('updateProgress', () => {
		it('should update hook progress', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			await manager.updateProgress(hook.id, 50);

			const updated = await manager.getHook(hook.id);
			expect(updated?.progress).toBe(50);
		});
	});

	describe('sendHeartbeat', () => {
		it('should update lastHeartbeat', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			await manager.sendHeartbeat(hook.id);

			const updated = await manager.getHook(hook.id);
			expect(updated?.lastHeartbeat).toBeDefined();
		});
	});

	describe('listHooks', () => {
		it('should list all hooks', async () => {
			await manager.createHook({ agentId: 'agent-1', beadId: 'bead-1' });
			await manager.createHook({ agentId: 'agent-2', beadId: 'bead-2' });

			const hooks = await manager.listHooks();
			expect(hooks).toHaveLength(2);
		});
	});

	describe('listByStatus', () => {
		it('should filter hooks by status', async () => {
			await manager.createHook({ agentId: 'agent-1', beadId: 'bead-1', status: 'pending' });
			await manager.createHook({ agentId: 'agent-2', beadId: 'bead-2', status: 'active' });
			await manager.createHook({ agentId: 'agent-3', beadId: 'bead-3', status: 'pending' });

			const pending = await manager.listByStatus('pending');
			expect(pending).toHaveLength(2);
		});
	});

	describe('deleteHook', () => {
		it('should delete a hook', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
			});

			await manager.deleteHook(hook.id);

			const loaded = await manager.getHook(hook.id);
			expect(loaded).toBeNull();
		});
	});

	describe('detectStalledHooks', () => {
		it('should detect hooks without recent heartbeat', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			// Manually set startedAt to old timestamp
			const oldHook: Hook = {
				...hook,
				startedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
			};
			await store.save(oldHook);

			// Create manager with short stall threshold (1ms)
			const shortManager = new HookManager({
				store,
				stallThreshold: 5 * 60 * 1000, // 5 minutes
			});

			const stalled = await shortManager.detectStalledHooks();
			expect(stalled).toContain(hook.id);
		});

		it('should not mark hooks with recent heartbeat', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			});

			// Set recent heartbeat
			const activeHook: Hook = {
				...hook,
				startedAt: Date.now() - 60 * 1000, // 1 minute ago
				lastHeartbeat: Date.now() - 30 * 1000, // 30 seconds ago
			};
			await store.save(activeHook);

			const shortManager = new HookManager({
				store,
				stallThreshold: 5 * 60 * 1000, // 5 minutes
			});

			const stalled = await shortManager.detectStalledHooks();
			expect(stalled).not.toContain(hook.id);
		});
	});

	describe('reassign', () => {
		it('should reassign hook to new agent', async () => {
			const hook = await manager.createHook({
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'stalled',
			});

			await manager.reassign(hook.id, 'agent-2');

			const updated = await manager.getHook(hook.id);
			expect(updated?.agentId).toBe('agent-2');
			expect(updated?.status).toBe('pending');
		});
	});

	describe('getStats', () => {
		it('should return hook statistics', async () => {
			await manager.createHook({ agentId: 'agent-1', beadId: 'bead-1', status: 'pending' });
			await manager.createHook({ agentId: 'agent-2', beadId: 'bead-2', status: 'active' });
			await manager.createHook({ agentId: 'agent-3', beadId: 'bead-3', status: 'completed' });
			await manager.createHook({ agentId: 'agent-4', beadId: 'bead-4', status: 'stalled' });

			const stats = await manager.getStats();

			expect(stats.total).toBe(4);
			expect(stats.pending).toBe(1);
			expect(stats.active).toBe(1);
			expect(stats.completed).toBe(1);
			expect(stats.stalled).toBe(1);
		});
	});
});