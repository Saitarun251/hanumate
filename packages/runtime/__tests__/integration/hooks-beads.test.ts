/**
 * Hooks-Beads Integration Tests
 * 
 * Tests the integration between the Hooks and Beads systems:
 * - Create bead → assign to agent → hook is created
 * - Bead status changes → hook status is updated
 * - Bead closes → hook is marked completed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HookManager } from '../../src/hooks/hook-manager.js';
import { InMemoryHookStore } from '../../src/hooks/hook-store.js';
import { createInMemoryBeadStore } from '../../src/beads/bead-store.js';
import { HooksBeadsIntegration } from '../../src/integration/hooks-beads.js';

describe('Hooks-Beads Integration', () => {
	let hookStore: InMemoryHookStore;
	let hookManager: HookManager;
	let beadStore: ReturnType<typeof createInMemoryBeadStore>;
	let integration: HooksBeadsIntegration;

	beforeEach(() => {
		hookStore = new InMemoryHookStore();
		hookManager = new HookManager({ store: hookStore });
		beadStore = createInMemoryBeadStore();
		integration = new HooksBeadsIntegration({
			hookManager,
			beadStore,
		});
	});

	afterEach(async () => {
		// Clean up hooks
		const hooks = await hookStore.list();
		for (const hook of hooks) {
			await hookStore.delete(hook.id);
		}
	});

	describe('assign bead to agent → create hook', () => {
		it('should create a hook when bead is assigned to agent', async () => {
			// Create a bead
			const bead = await beadStore.create({
				title: 'Test Task',
				description: 'Test description',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'user-1',
			});

			// Assign bead to agent
			await beadStore.update(bead.id, { assignee: 'agent-1' });

			// Manually sync (since we don't have automatic callbacks)
			await integration.syncBeadsWithHooks();

			// Verify hook was created
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook).not.toBeNull();
			expect(hook?.agentId).toBe('agent-1');
			expect(hook?.beadId).toBe(bead.id);
			expect(hook?.status).toBe('pending');
		});

		it('should not create duplicate hooks for same bead/agent', async () => {
			// Create a bead
			const bead = await beadStore.create({
				title: 'Test Task',
				description: 'Test description',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'user-1',
			});

			// Assign bead to agent
			await beadStore.update(bead.id, { assignee: 'agent-1' });

			// Sync multiple times
			await integration.syncBeadsWithHooks();
			await integration.syncBeadsWithHooks();
			await integration.syncBeadsWithHooks();

			// Should only have one hook
			const hooks = await hookManager.listHooks();
			const beadHooks = hooks.filter((h) => h.beadId === bead.id);
			expect(beadHooks).toHaveLength(1);
		});
	});

	describe('bead status change → hook status update', () => {
		it('should update hook to active when bead status changes to in_progress', async () => {
			// Create and assign a bead
			const bead = await beadStore.create({
				title: 'Test Task',
				description: 'Test description',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'user-1',
			});
			await beadStore.update(bead.id, { assignee: 'agent-1' });
			await integration.syncBeadsWithHooks();

			// Change bead status to in_progress
			await beadStore.update(bead.id, { status: 'in_progress' });
			await integration.onBeadStatusChanged(bead.id, 'open', 'in_progress');

			// Verify hook is now active
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('active');
			expect(hook?.startedAt).toBeDefined();
		});

		it('should update hook when bead status changes to done', async () => {
			// Create and assign a bead
			const bead = await beadStore.create({
				title: 'Test Task',
				description: 'Test description',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'user-1',
			});
			await beadStore.update(bead.id, { assignee: 'agent-1' });
			await integration.syncBeadsWithHooks();

			// Change bead status to done
			await beadStore.update(bead.id, { status: 'done' });
			await integration.onBeadStatusChanged(bead.id, 'open', 'done');

			// Verify hook is completed
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('completed');
			expect(hook?.completedAt).toBeDefined();
		});
	});

	describe('bead closure → hook completion', () => {
		it('should mark hook as completed when bead is closed', async () => {
			// Create and assign a bead
			const bead = await beadStore.create({
				title: 'Test Task',
				description: 'Test description',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'user-1',
			});
			await beadStore.update(bead.id, { assignee: 'agent-1' });
			await integration.syncBeadsWithHooks();

			// Close the bead (mark as done)
			await beadStore.update(bead.id, { status: 'done' });
			await integration.onBeadClosed(bead.id);

			// Verify hook is completed
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('completed');
			expect(hook?.completedAt).toBeDefined();
			expect(hook?.progress).toBe(100);
		});
	});

	describe('full lifecycle test', () => {
		it('should create bead → assign to agent → create hook → complete bead → hook marked completed', async () => {
			// Step 1: Create a bead
			const bead = await beadStore.create({
				title: 'Integration Test Task',
				description: 'Testing hooks and beads integration',
				type: 'task',
				priority: 'P0',
				status: 'open',
				createdBy: 'developer',
			});
			expect(bead.id).toMatch(/^rd-/);
			expect(bead.status).toBe('open');

			// Step 2: Assign to agent
			await beadStore.update(bead.id, { assignee: 'agent-42' });
			await integration.syncBeadsWithHooks();

			// Verify hook was created
			let hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook).not.toBeNull();
			expect(hook?.agentId).toBe('agent-42');
			expect(hook?.status).toBe('pending');

			// Step 3: Bead status changes to in_progress
			await beadStore.update(bead.id, { status: 'in_progress' });
			await integration.onBeadStatusChanged(bead.id, 'open', 'in_progress');

			// Verify hook is active
			hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('active');
			expect(hook?.startedAt).toBeDefined();

			// Step 4: Work is done, bead is closed
			await beadStore.update(bead.id, { status: 'done' });
			await integration.onBeadClosed(bead.id);

			// Verify hook is completed
			hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('completed');
			expect(hook?.completedAt).toBeDefined();
			expect(hook?.progress).toBe(100);

			// Verify no duplicate hooks were created
			const allHooks = await hookManager.listHooks();
			const beadHooks = allHooks.filter((h) => h.beadId === bead.id);
			expect(beadHooks).toHaveLength(1);
		});

		it('should handle rapid status changes correctly', async () => {
			const bead = await beadStore.create({
				title: 'Rapid Status Change Test',
				description: 'Test',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'tester',
			});
			await beadStore.update(bead.id, { assignee: 'worker-1' });
			await integration.syncBeadsWithHooks();

			// Rapid status changes
			await beadStore.update(bead.id, { status: 'in_progress' });
			await integration.onBeadStatusChanged(bead.id, 'open', 'in_progress');

			await beadStore.update(bead.id, { status: 'done' });
			await integration.onBeadClosed(bead.id);

			// Hook should end up completed
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('completed');
		});

		it('should not break when same status is set twice', async () => {
			const bead = await beadStore.create({
				title: 'Double Status Test',
				description: 'Test',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'tester',
			});
			await beadStore.update(bead.id, { assignee: 'worker-2' });
			await integration.syncBeadsWithHooks();

			// Set same status twice
			await beadStore.update(bead.id, { status: 'in_progress' });
			await integration.onBeadStatusChanged(bead.id, 'open', 'in_progress');

			await beadStore.update(bead.id, { status: 'in_progress' });
			await integration.onBeadStatusChanged(bead.id, 'in_progress', 'in_progress');

			// Hook should still be in active state
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook?.status).toBe('active');
		});
	});

	describe('edge cases', () => {
		it('should handle beads without assignee gracefully', async () => {
			const bead = await beadStore.create({
				title: 'Unassigned Task',
				description: 'No assignee',
				type: 'task',
				priority: 'P3',
				status: 'open',
				createdBy: 'someone',
			});

			// Sync should not throw
			await expect(integration.syncBeadsWithHooks()).resolves.not.toThrow();

			// No hooks should be created for unassigned beads
			const hooks = await hookManager.listHooks();
			expect(hooks).toHaveLength(0);
		});

		it('should handle non-existent bead IDs in callbacks', async () => {
			// These should not throw
			await expect(
				integration.onBeadStatusChanged('non-existent', 'open', 'done')
			).resolves.not.toThrow();
			await expect(integration.onBeadClosed('non-existent')).resolves.not.toThrow();
		});

		it('should handle concurrent operations', async () => {
			const bead = await beadStore.create({
				title: 'Concurrent Test',
				description: 'Test',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'tester',
			});

			// Assign and sync concurrently
			await Promise.all([
				beadStore.update(bead.id, { assignee: 'worker-1' }),
				integration.syncBeadsWithHooks(),
			]);

			// Hook should be created
			const hook = await hookManager.getHookByBeadId(bead.id);
			expect(hook).not.toBeNull();
		});
	});
});