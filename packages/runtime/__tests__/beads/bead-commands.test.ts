/**
 * Bead Commands Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	createInMemoryBeadStore,
	createBeadCommands,
	type BeadCommands,
	formatBeadForCLI,
	formatBeadList,
} from '../../src/beads/index.js';
import type { Bead } from '../../src/beads/bead-types.js';

describe('Bead Commands', () => {
	let commands: BeadCommands;
	let store: ReturnType<typeof createInMemoryBeadStore>;

	beforeEach(() => {
		store = createInMemoryBeadStore();
		commands = createBeadCommands(store, 'test-agent');
	});

	describe('create', () => {
		it('should create a bead with required fields', async () => {
			const result = await commands.create({
				title: 'Test Bead',
			});

			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			expect(result.data!.id).toMatch(/^rd-/);
			expect(result.data!.title).toBe('Test Bead');
		});

		it('should use default values for optional fields', async () => {
			const result = await commands.create({
				title: 'Test Bead',
			});

			expect(result.data!.type).toBe('task');
			expect(result.data!.priority).toBe('P2');
			expect(result.data!.status).toBe('open');
			expect(result.data!.createdBy).toBe('test-agent');
		});

		it('should accept all optional fields', async () => {
			const result = await commands.create({
				title: 'Test Bead',
				description: 'A test description',
				type: 'feature',
				priority: 'P0',
				assignee: 'agent-1',
				tags: ['important', 'frontend'],
			});

			expect(result.success).toBe(true);
			expect(result.data!.description).toBe('A test description');
			expect(result.data!.type).toBe('feature');
			expect(result.data!.priority).toBe('P0');
			expect(result.data!.assignee).toBe('agent-1');
			expect(result.data!.tags).toEqual(['important', 'frontend']);
		});

		it('should validate dependsOn bead IDs', async () => {
			const result = await commands.create({
				title: 'Test Bead',
				dependsOn: ['rd-invalid'],
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid bead ID format');
		});

		it('should validate that dependsOn beads exist', async () => {
			const result = await commands.create({
				title: 'Test Bead',
				dependsOn: ['rd-nonex'],
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});

		it('should allow creating with valid dependencies', async () => {
			// Create dependency first
			const dep = await commands.create({ title: 'Dependency' });
			
			const result = await commands.create({
				title: 'Test Bead',
				dependsOn: [dep.data!.id],
			});

			expect(result.success).toBe(true);
			expect(result.data!.dependsOn).toContain(dep.data!.id);
		});
	});

	describe('show', () => {
		it('should return a bead by ID', async () => {
			const created = await commands.create({ title: 'Test Bead' });
			
			const result = await commands.show(created.data!.id);

			expect(result.success).toBe(true);
			expect(result.data!.title).toBe('Test Bead');
		});

		it('should return error for invalid ID format', async () => {
			const result = await commands.show('invalid');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid bead ID format');
		});

		it('should return error for non-existent bead', async () => {
			const result = await commands.show('rd-nonex');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Bead not found');
		});
	});

	describe('list', () => {
		beforeEach(async () => {
			await commands.create({ title: 'Task 1', type: 'task', priority: 'P1', status: 'open' });
			await commands.create({ title: 'Bug 1', type: 'bug', priority: 'P0', status: 'open' });
			await commands.create({ title: 'Task 2', type: 'task', priority: 'P2', status: 'done' });
		});

		it('should list all beads by default', async () => {
			const result = await commands.list();

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(3);
		});

		it('should filter by status', async () => {
			const result = await commands.list({ status: 'open' });

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(2);
		});

		it('should filter by type', async () => {
			const result = await commands.list({ type: 'task' });

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(2);
		});

		it('should filter by priority', async () => {
			const result = await commands.list({ priority: 'P0' });

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(1);
		});

		it('should search by title/description', async () => {
			const result = await commands.list({ search: 'Bug' });

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(1);
			expect(result.data![0].title).toBe('Bug 1');
		});

		it('should sort by priority', async () => {
			const result = await commands.list({ sort: 'priority' });

			expect(result.success).toBe(true);
			expect(result.data![0].priority).toBe('P0');
		});

		it('should return empty array for no matches', async () => {
			const result = await commands.list({ status: 'blocked' });

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(0);
		});
	});

	describe('update', () => {
		it('should update bead fields', async () => {
			const created = await commands.create({ title: 'Original Title' });
			
			const result = await commands.update(created.data!.id, {
				title: 'Updated Title',
				status: 'in_progress',
			});

			expect(result.success).toBe(true);
			expect(result.data!.title).toBe('Updated Title');
			expect(result.data!.status).toBe('in_progress');
		});

		it('should handle addTags', async () => {
			const created = await commands.create({ title: 'Test', tags: ['tag1'] });
			
			const result = await commands.update(created.data!.id, {
				addTags: ['tag2', 'tag3'],
			});

			expect(result.success).toBe(true);
			expect(result.data!.tags).toContain('tag1');
			expect(result.data!.tags).toContain('tag2');
			expect(result.data!.tags).toContain('tag3');
		});

		it('should handle removeTags', async () => {
			const created = await commands.create({
				title: 'Test',
				tags: ['tag1', 'tag2', 'tag3'],
			});
			
			const result = await commands.update(created.data!.id, {
				removeTags: ['tag2'],
			});

			expect(result.success).toBe(true);
			expect(result.data!.tags).not.toContain('tag2');
			expect(result.data!.tags).toContain('tag1');
			expect(result.data!.tags).toContain('tag3');
		});

		it('should return error for invalid ID', async () => {
			const result = await commands.update('rd-invalid', { title: 'Test' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid bead ID format');
		});

		it('should return error for non-existent bead', async () => {
			const result = await commands.update('rd-nonex', { title: 'Test' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Bead not found');
		});
	});

	describe('close', () => {
		it('should set status to done', async () => {
			const created = await commands.create({ title: 'Test Bead' });
			
			const result = await commands.close(created.data!.id);

			expect(result.success).toBe(true);
			expect(result.data!.status).toBe('done');
		});
	});

	describe('ready', () => {
		it('should return unblocked ready beads', async () => {
			const dep = await commands.create({ title: 'Dependency', status: 'done' });
			
			await commands.create({
				title: 'Ready Bead',
				status: 'open',
				dependsOn: [dep.data!.id],
			});

			await commands.create({
				title: 'Another Ready',
				status: 'open',
			});

			await commands.create({
				title: 'Done Bead',
				status: 'done',
			});

			const result = await commands.ready();

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(2);
		});
	});

	describe('addDep', () => {
		it('should add a dependency', async () => {
			const bead1 = await commands.create({ title: 'Bead 1' });
			const bead2 = await commands.create({ title: 'Bead 2' });
			
			const result = await commands.addDep(bead1.data!.id, bead2.data!.id);

			expect(result.success).toBe(true);
			expect(result.data!.dependsOn).toContain(bead2.data!.id);
		});

		it('should return error for invalid ID format', async () => {
			const result = await commands.addDep('invalid', 'rd-abcde');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid bead ID format');
		});
	});

	describe('removeDep', () => {
		it('should remove a dependency', async () => {
			const bead1 = await commands.create({ title: 'Bead 1' });
			const bead2 = await commands.create({ title: 'Bead 2' });
			
			await commands.addDep(bead1.data!.id, bead2.data!.id);
			const result = await commands.removeDep(bead1.data!.id, bead2.data!.id);

			expect(result.success).toBe(true);
			// After removing the only dependency, dependsOn should be undefined or empty
			expect(result.data!.dependsOn ?? []).not.toContain(bead2.data!.id);
		});
	});

	describe('dependents', () => {
		it('should return beads that depend on a bead', async () => {
			const dep = await commands.create({ title: 'Dependency' });
			const bead1 = await commands.create({ title: 'Bead 1' });
			const bead2 = await commands.create({ title: 'Bead 2' });
			
			await commands.addDep(bead1.data!.id, dep.data!.id);
			await commands.addDep(bead2.data!.id, dep.data!.id);

			const result = await commands.dependents(dep.data!.id);

			expect(result.success).toBe(true);
			expect(result.data!.length).toBe(2);
		});
	});

	describe('delete', () => {
		it('should delete a bead', async () => {
			const created = await commands.create({ title: 'Test Bead' });
			
			const result = await commands.delete(created.data!.id);

			expect(result.success).toBe(true);

			const showResult = await commands.show(created.data!.id);
			expect(showResult.success).toBe(false);
		});

		it('should return error for non-existent bead', async () => {
			const result = await commands.delete('rd-nonex');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Bead not found');
		});
	});
});

describe('CLI Formatting', () => {
	describe('formatBeadForCLI', () => {
		const createBead = (): Bead => ({
			id: 'rd-abc12',
			title: 'Test Bead',
			description: 'A test description\nwith multiple lines',
			type: 'task',
			priority: 'P1',
			status: 'open',
			createdBy: 'test-agent',
			createdAt: new Date('2024-01-15').getTime(),
			updatedAt: new Date('2024-01-16').getTime(),
			assignee: 'agent-1',
			tags: ['important'],
			dependsOn: ['rd-def34'],
		});

		it('should format basic bead info', () => {
			const bead = createBead();
			const output = formatBeadForCLI(bead);

			expect(output).toContain('rd-abc12');
			expect(output).toContain('[P1]');
			expect(output).toContain('Test Bead');
		});

		it('should include verbose info when requested', () => {
			const bead = createBead();
			const output = formatBeadForCLI(bead, true);

			expect(output).toContain('Type:        task');
			expect(output).toContain('Assignee:    agent-1');
			expect(output).toContain('Depends on:  rd-def34');
			expect(output).toContain('Tags:        important');
		});

		it('should show description in verbose mode', () => {
			const bead = createBead();
			const output = formatBeadForCLI(bead, true);

			expect(output).toContain('Description:');
			expect(output).toContain('A test description');
		});
	});

	describe('formatBeadList', () => {
		it('should format multiple beads', () => {
			const beads: Bead[] = [
				{
					id: 'rd-abc12',
					title: 'Bead 1',
					description: '',
					type: 'task',
					priority: 'P1',
					status: 'open',
					createdBy: 'test',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
				{
					id: 'rd-def34',
					title: 'Bead 2',
					description: '',
					type: 'bug',
					priority: 'P0',
					status: 'done',
					createdBy: 'test',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			];

			const output = formatBeadList(beads);

			expect(output).toContain('Found 2 bead(s):');
			expect(output).toContain('Bead 1');
			expect(output).toContain('Bead 2');
		});

		it('should handle empty list', () => {
			const output = formatBeadList([]);

			expect(output).toBe('No beads found');
		});
	});
});