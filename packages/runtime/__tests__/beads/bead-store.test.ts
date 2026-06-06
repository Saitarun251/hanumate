/**
 * Bead Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	createInMemoryBeadStore,
	createBeadStore,
	type BeadStore,
	type Bead,
} from '../../src/beads/bead-store.js';
import type { CreateBeadInput, UpdateBeadInput, BeadFilter } from '../../src/beads/bead-types.js';

describe('Bead Store', () => {
	let store: BeadStore;

	beforeEach(() => {
		store = createInMemoryBeadStore();
	});

	describe('create', () => {
		it('should create a bead with auto-generated id and timestamps', async () => {
			const input: CreateBeadInput = {
				title: 'Test Bead',
				description: 'Test description',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test-user',
			};

			const bead = await store.create(input);

			expect(bead.id).toMatch(/^rd-[a-z0-9]{5}$/);
			expect(bead.title).toBe('Test Bead');
			expect(bead.description).toBe('Test description');
			expect(bead.type).toBe('task');
			expect(bead.priority).toBe('P2');
			expect(bead.status).toBe('open');
			expect(bead.createdBy).toBe('test-user');
			expect(bead.createdAt).toBeDefined();
			expect(bead.updatedAt).toBeDefined();
		});

		it('should create beads with different IDs', async () => {
			const bead1 = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead2 = await store.create({
				title: 'Bead 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			expect(bead1.id).not.toBe(bead2.id);
		});

		it('should support optional fields', async () => {
			const input: CreateBeadInput = {
				title: 'Test Bead',
				description: 'Description',
				type: 'feature',
				priority: 'P1',
				status: 'open',
				createdBy: 'test',
				assignee: 'agent-1',
				dependsOn: ['rd-abcde'],
				tags: ['important', 'frontend'],
			};

			const bead = await store.create(input);

			expect(bead.assignee).toBe('agent-1');
			expect(bead.dependsOn).toEqual(['rd-abcde']);
			expect(bead.tags).toEqual(['important', 'frontend']);
		});
	});

	describe('get', () => {
		it('should return a bead by ID', async () => {
			const created = await store.create({
				title: 'Test Bead',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead = await store.get(created.id);

			expect(bead).not.toBeNull();
			expect(bead!.id).toBe(created.id);
			expect(bead!.title).toBe('Test Bead');
		});

		it('should return null for non-existent bead', async () => {
			const bead = await store.get('rd-nonex');

			expect(bead).toBeNull();
		});
	});

	describe('update', () => {
		it('should update a bead', async () => {
			const created = await store.create({
				title: 'Original Title',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const updates: UpdateBeadInput = {
				title: 'Updated Title',
				status: 'in_progress',
				priority: 'P1',
			};

			const updated = await store.update(created.id, updates);

			expect(updated.title).toBe('Updated Title');
			expect(updated.status).toBe('in_progress');
			expect(updated.priority).toBe('P1');
			expect(updated.createdAt).toBe(created.createdAt); // Should not change
			expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
		});

		it('should throw error for non-existent bead', async () => {
			await expect(
				store.update('rd-nonex', { title: 'Test' })
			).rejects.toThrow('Bead not found');
		});

		it('should not allow ID changes', async () => {
			const created = await store.create({
				title: 'Test',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const updated = await store.update(created.id, { id: 'rd-xxxxx' } as UpdateBeadInput);

			expect(updated.id).toBe(created.id);
		});

		it('should not allow createdAt changes', async () => {
			const created = await store.create({
				title: 'Test',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const newCreatedAt = created.createdAt - 1000;
			const updated = await store.update(created.id, { createdAt: newCreatedAt } as UpdateBeadInput);

			expect(updated.createdAt).toBe(created.createdAt);
		});
	});

	describe('delete', () => {
		it('should delete a bead', async () => {
			const created = await store.create({
				title: 'Test Bead',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			await store.delete(created.id);

			const bead = await store.get(created.id);
			expect(bead).toBeNull();
		});

		it('should throw error for non-existent bead', async () => {
			await expect(store.delete('rd-nonex')).rejects.toThrow('Bead not found');
		});
	});

	describe('list', () => {
		beforeEach(async () => {
			// Create test beads
			await store.create({
				title: 'Task 1',
				description: '',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'test',
			});

			await store.create({
				title: 'Bug 1',
				description: '',
				type: 'bug',
				priority: 'P0',
				status: 'open',
				createdBy: 'test',
			});

			await store.create({
				title: 'Task 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'done',
				createdBy: 'test',
			});

			await store.create({
				title: 'Feature 1',
				description: '',
				type: 'feature',
				priority: 'P2',
				status: 'in_progress',
				createdBy: 'test',
			});
		});

		it('should list all beads', async () => {
			const beads = await store.list();

			expect(beads.length).toBe(4);
		});

		it('should filter by status', async () => {
			const filter: BeadFilter = { status: 'open' };
			const beads = await store.list(filter);

			expect(beads.length).toBe(2);
			beads.forEach((b) => expect(b.status).toBe('open'));
		});

		it('should filter by type', async () => {
			const filter: BeadFilter = { type: 'task' };
			const beads = await store.list(filter);

			expect(beads.length).toBe(2);
			beads.forEach((b) => expect(b.type).toBe('task'));
		});

		it('should filter by priority', async () => {
			const filter: BeadFilter = { priority: 'P0' };
			const beads = await store.list(filter);

			expect(beads.length).toBe(1);
			expect(beads[0].priority).toBe('P0');
		});

		it('should filter by search term', async () => {
			const filter: BeadFilter = { search: 'Bug' };
			const beads = await store.list(filter);

			expect(beads.length).toBe(1);
			expect(beads[0].title).toBe('Bug 1');
		});
	});

	describe('ready', () => {
		it('should return unblocked beads that are not done', async () => {
			// Create a blocked bead
			const dep = await store.create({
				title: 'Dependency',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const blockedBead = await store.create({
				title: 'Blocked Bead',
				description: '',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'test',
				dependsOn: [dep.id],
			});

			// Verify blocked bead has dependencies
			expect(blockedBead.dependsOn).toBeDefined();
			expect(blockedBead.dependsOn).toContain(dep.id);

			// Create a ready bead (no dependencies)
			await store.create({
				title: 'Ready Bead',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			// Create a done bead
			await store.create({
				title: 'Done Bead',
				description: '',
				type: 'task',
				priority: 'P0',
				status: 'done',
				createdBy: 'test',
			});

			const readyBeads = await store.ready();

			// Should return unblocked beads that are not done
			// "Dependency" is ready (no deps, open), "Ready Bead" is ready (no deps, open)
			// "Blocked Bead" is blocked (Dependency is open), "Done Bead" is excluded (done)
			expect(readyBeads.length).toBe(2);
			const titles = readyBeads.map(b => b.title).sort();
			expect(titles).toEqual(['Dependency', 'Ready Bead']);
		});

		it('should return unblocked beads when dependency is done', async () => {
			const dep = await store.create({
				title: 'Completed Dependency',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'done', // Dependency is done
				createdBy: 'test',
			});

			const blockedBead = await store.create({
				title: 'Should Be Ready',
				description: '',
				type: 'task',
				priority: 'P1',
				status: 'open',
				createdBy: 'test',
				dependsOn: [dep.id],
			});

			const readyBeads = await store.ready();

			// The bead should be ready since its dependency is done
			const found = readyBeads.find((b) => b.id === blockedBead.id);
			expect(found).toBeDefined();
		});
	});

	describe('dependencies', () => {
		it('should add a dependency', async () => {
			const bead1 = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead2 = await store.create({
				title: 'Bead 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const updated = await store.addDependency(bead1.id, bead2.id);

			expect(updated.dependsOn).toContain(bead2.id);
		});

		it('should throw error for non-existent dependency', async () => {
			const bead = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			await expect(
				store.addDependency(bead.id, 'rd-nonex')
			).rejects.toThrow('Dependency bead not found');
		});

		it('should not add duplicate dependencies', async () => {
			const bead1 = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead2 = await store.create({
				title: 'Bead 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			await store.addDependency(bead1.id, bead2.id);
			await store.addDependency(bead1.id, bead2.id); // Add again

			const updated = await store.get(bead1.id);
			expect(updated!.dependsOn!.filter((d) => d === bead2.id).length).toBe(1);
		});

		it('should remove a dependency', async () => {
			const bead1 = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead2 = await store.create({
				title: 'Bead 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			await store.addDependency(bead1.id, bead2.id);
			const updated = await store.removeDependency(bead1.id, bead2.id);

			// After removing the only dependency, dependsOn should be undefined or empty
			expect(updated.dependsOn ?? []).not.toContain(bead2.id);
		});

		it('should get dependents', async () => {
			const dep = await store.create({
				title: 'Dependency',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
			});

			const bead1 = await store.create({
				title: 'Bead 1',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
				dependsOn: [dep.id],
			});

			const bead2 = await store.create({
				title: 'Bead 2',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
				dependsOn: [dep.id],
			});

			const dependents = await store.getDependents(dep.id);

			expect(dependents.length).toBe(2);
			expect(dependents.map((b) => b.id)).toContain(bead1.id);
			expect(dependents.map((b) => b.id)).toContain(bead2.id);
		});
	});
});

describe('JsonBeadStore', () => {
	// Note: JsonBeadStore requires file system operations
	// These tests would be integration tests in a real scenario
	// For unit testing, we use createInMemoryBeadStore

	it('should be creatable via factory function', () => {
		const store = createBeadStore();
		expect(store).toBeDefined();
	});
});