/**
 * Hook Store Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HookStore, InMemoryHookStore } from '../../src/hooks/hook-store.ts';
import type { Hook } from '../../src/hooks/hook-types.ts';
import { createHook, type HookStatus } from '../../src/hooks/hook-types.ts';

describe('InMemoryHookStore', () => {
	let store: InMemoryHookStore;

	beforeEach(() => {
		store = new InMemoryHookStore();
	});

	describe('save and load', () => {
		it('should save and load a hook', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			const loaded = await store.load(hook.id);
			
			expect(loaded).not.toBeNull();
			expect(loaded?.id).toBe(hook.id);
			expect(loaded?.agentId).toBe('agent-1');
			expect(loaded?.beadId).toBe('bead-123');
		});

		it('should return null for non-existent hook', async () => {
			const loaded = await store.load('non-existent-hook');
			expect(loaded).toBeNull();
		});

		it('should update existing hook on save', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			
			const updatedHook: Hook = { ...hook, status: 'completed' };
			await store.save(updatedHook);
			
			const loaded = await store.load(hook.id);
			expect(loaded?.status).toBe('completed');
		});
	});

	describe('loadByAgentId', () => {
		it('should find hook by agent ID', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			const loaded = await store.loadByAgentId('agent-1');
			expect(loaded).not.toBeNull();
			expect(loaded?.id).toBe(hook.id);
		});

		it('should return null for agent with no hook', async () => {
			const loaded = await store.loadByAgentId('non-existent-agent');
			expect(loaded).toBeNull();
		});
	});

	describe('list', () => {
		it('should list all hooks', async () => {
			const hook1 = createHook({ agentId: 'agent-1', beadId: 'bead-1' });
			const hook2 = createHook({ agentId: 'agent-2', beadId: 'bead-2' });
			
			await store.save(hook1);
			await store.save(hook2);
			
			const hooks = await store.list();
			expect(hooks).toHaveLength(2);
		});

		it('should return empty array when no hooks', async () => {
			const hooks = await store.list();
			expect(hooks).toHaveLength(0);
		});
	});

	describe('listByStatus', () => {
		it('should filter hooks by status', async () => {
			const hook1 = createHook({ agentId: 'agent-1', beadId: 'bead-1', status: 'pending' });
			const hook2 = createHook({ agentId: 'agent-2', beadId: 'bead-2', status: 'active' });
			const hook3 = createHook({ agentId: 'agent-3', beadId: 'bead-3', status: 'pending' });
			
			await store.save(hook1);
			await store.save(hook2);
			await store.save(hook3);
			
			const pendingHooks = await store.listByStatus('pending');
			expect(pendingHooks).toHaveLength(2);
		});
	});

	describe('delete', () => {
		it('should delete a hook', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.delete(hook.id);
			
			const loaded = await store.load(hook.id);
			expect(loaded).toBeNull();
		});

		it('should not throw when deleting non-existent hook', async () => {
			await expect(store.delete('non-existent')).resolves.not.toThrow();
		});
	});

	describe('popWork (GUPP)', () => {
		it('should return and activate pending hook for agent', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123', status: 'pending' });
			await store.save(hook);
			
			const poppedHook = await store.popWork('agent-1');
			
			expect(poppedHook).not.toBeNull();
			expect(poppedHook?.status).toBe('active');
			expect(poppedHook?.startedAt).toBeDefined();
		});

		it('should return null when no pending work for agent', async () => {
			const poppedHook = await store.popWork('agent-with-no-work');
			expect(poppedHook).toBeNull();
		});

		it('should return oldest pending hook first', async () => {
			const hook1 = createHook({ agentId: 'agent-1', beadId: 'bead-1' });
			const hook2 = createHook({ agentId: 'agent-1', beadId: 'bead-2' });
			
			await store.save(hook1);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await store.save(hook2);
			
			const poppedHook = await store.popWork('agent-1');
			
			expect(poppedHook?.beadId).toBe('bead-1');
		});
	});

	describe('updateStatus', () => {
		it('should update hook status', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.updateStatus(hook.id, 'completed');
			
			const loaded = await store.load(hook.id);
			expect(loaded?.status).toBe('completed');
			expect(loaded?.completedAt).toBeDefined();
		});

		it('should throw for non-existent hook', async () => {
			await expect(store.updateStatus('non-existent', 'completed')).rejects.toThrow();
		});
	});

	describe('updateProgress', () => {
		it('should update hook progress', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.updateProgress(hook.id, 50);
			
			const loaded = await store.load(hook.id);
			expect(loaded?.progress).toBe(50);
		});

		it('should clamp progress to 0-100', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.updateProgress(hook.id, 150);
			
			const loaded = await store.load(hook.id);
			expect(loaded?.progress).toBe(100);
		});

		it('should clamp negative progress to 0', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.updateProgress(hook.id, -10);
			
			const loaded = await store.load(hook.id);
			expect(loaded?.progress).toBe(0);
		});
	});

	describe('heartbeat', () => {
		it('should update lastHeartbeat timestamp', async () => {
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			await store.save(hook);
			
			await store.heartbeat(hook.id);
			
			const loaded = await store.load(hook.id);
			expect(loaded?.lastHeartbeat).toBeDefined();
		});
	});
});

describe('HookStore (File-based)', () => {
	const testDir = join(__dirname, '.test-hooks');
	
	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
		mkdirSync(testDir, { recursive: true });
	});
	
	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe('save and load', () => {
		it('should save and load a hook', async () => {
			const store = new HookStore(testDir);
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			const loaded = await store.load(hook.id);
			
			expect(loaded).not.toBeNull();
			expect(loaded?.id).toBe(hook.id);
		});

		it('should persist hook to JSON file', async () => {
			const store = new HookStore(testDir);
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			
			const filePath = join(testDir, `${hook.id}.json`);
			expect(existsSync(filePath)).toBe(true);
			
			const content = readFileSync(filePath, 'utf-8');
			const parsed = JSON.parse(content);
			expect(parsed.id).toBe(hook.id);
		});
	});

	describe('list', () => {
		it('should list all hooks from files', async () => {
			const store = new HookStore(testDir);
			
			const hook1 = createHook({ agentId: 'agent-1', beadId: 'bead-1' });
			const hook2 = createHook({ agentId: 'agent-2', beadId: 'bead-2' });
			
			await store.save(hook1);
			await store.save(hook2);
			
			const hooks = await store.list();
			expect(hooks).toHaveLength(2);
		});

		it('should return empty array for empty directory', async () => {
			const store = new HookStore(testDir);
			const hooks = await store.list();
			expect(hooks).toHaveLength(0);
		});
	});

	describe('delete', () => {
		it('should delete hook file', async () => {
			const store = new HookStore(testDir);
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			await store.delete(hook.id);
			
			const filePath = join(testDir, `${hook.id}.json`);
			expect(existsSync(filePath)).toBe(false);
		});
	});

	describe('popWork (GUPP)', () => {
		it('should activate and return pending hook', async () => {
			const store = new HookStore(testDir);
			const hook = createHook({ agentId: 'agent-1', beadId: 'bead-123' });
			
			await store.save(hook);
			
			const poppedHook = await store.popWork('agent-1');
			
			expect(poppedHook).not.toBeNull();
			expect(poppedHook?.status).toBe('active');
		});
	});
});