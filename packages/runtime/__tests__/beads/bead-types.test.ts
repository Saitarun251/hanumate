/**
 * Bead Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
	generateBeadId,
	isValidBeadId,
	getDefaultStatus,
	isBlocked,
	sortByPriority,
	formatBead,
	type Bead,
	type BeadType,
	type BeadPriority,
	type BeadStatus,
} from '../../src/beads/bead-types.js';

describe('Bead Types', () => {
	describe('generateBeadId', () => {
		it('should generate unique bead IDs', () => {
			const id1 = generateBeadId();
			const id2 = generateBeadId();

			expect(id1).not.toBe(id2);
		});

		it('should start with rd- prefix', () => {
			const id = generateBeadId();
			expect(id.startsWith('rd-')).toBe(true);
		});

		it('should have 5 alphanumeric characters after prefix', () => {
			const id = generateBeadId();
			const suffix = id.slice(3); // Remove 'rd-' prefix

			expect(suffix).toMatch(/^[a-z0-9]{5}$/);
		});
	});

	describe('isValidBeadId', () => {
		it('should return true for valid bead IDs', () => {
			const validIds = ['rd-abc12', 'rd-xyz99', 'rd-00000', 'rd-abcde'];
			validIds.forEach((id) => {
				expect(isValidBeadId(id)).toBe(true);
			});
		});

		it('should return false for invalid bead IDs', () => {
			const invalidIds = [
				'abc12',      // Missing rd- prefix
				'rd-',        // Too short
				'rd-abc',     // Only 3 chars after prefix
				'rd-abc123',  // 6 chars after prefix
				'rd-abc!@',   // Special characters
				'rd_abc12',   // Underscore instead of hyphen
				'RD-ABC12',   // Uppercase RD
				'',           // Empty string
			];
			invalidIds.forEach((id) => {
				expect(isValidBeadId(id)).toBe(false);
			});
		});
	});

	describe('getDefaultStatus', () => {
		it('should return open for all bead types', () => {
			const types: BeadType[] = ['task', 'bug', 'feature', 'epic', 'question', 'docs'];
			types.forEach((type) => {
				expect(getDefaultStatus(type)).toBe('open');
			});
		});
	});

	describe('isBlocked', () => {
		const createBead = (id: string, status: BeadStatus): Bead => ({
			id,
			title: `Bead ${id}`,
			description: '',
			type: 'task',
			priority: 'P2',
			status,
			createdBy: 'test',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		it('should return false for beads with no dependencies', () => {
			const bead = createBead('rd-abc12', 'open');
			const allBeads = new Map([['rd-abc12', bead]]);

			expect(isBlocked(bead, allBeads)).toBe(false);
		});

		it('should return false when all dependencies are done', () => {
			const bead = createBead('rd-abc12', 'open');
			const dep = createBead('rd-def34', 'done');
			bead.dependsOn = ['rd-def34'];

			const allBeads = new Map([
				['rd-abc12', bead],
				['rd-def34', dep],
			]);

			expect(isBlocked(bead, allBeads)).toBe(false);
		});

		it('should return true when any dependency is not done', () => {
			const bead = createBead('rd-abc12', 'open');
			const dep = createBead('rd-def34', 'in_progress');
			bead.dependsOn = ['rd-def34'];

			const allBeads = new Map([
				['rd-abc12', bead],
				['rd-def34', dep],
			]);

			expect(isBlocked(bead, allBeads)).toBe(true);
		});

		it('should return false when dependency does not exist', () => {
			const bead = createBead('rd-abc12', 'open');
			bead.dependsOn = ['rd-nonexistent'];

			const allBeads = new Map([['rd-abc12', bead]]);

			// Non-existent dependencies don't block
			expect(isBlocked(bead, allBeads)).toBe(false);
		});

		it('should return true when one of multiple dependencies is not done', () => {
			const bead = createBead('rd-abc12', 'open');
			const dep1 = createBead('rd-def34', 'done');
			const dep2 = createBead('rd-ghi56', 'open');
			bead.dependsOn = ['rd-def34', 'rd-ghi56'];

			const allBeads = new Map([
				['rd-abc12', bead],
				['rd-def34', dep1],
				['rd-ghi56', dep2],
			]);

			expect(isBlocked(bead, allBeads)).toBe(true);
		});
	});

	describe('sortByPriority', () => {
		const createBead = (id: string, priority: BeadPriority, createdAt: number): Bead => ({
			id,
			title: `Bead ${id}`,
			description: '',
			type: 'task',
			priority,
			status: 'open',
			createdBy: 'test',
			createdAt,
			updatedAt: Date.now(),
		});

		it('should sort by priority (P0 first)', () => {
			const beads = [
				createBead('rd-p2', 'P2', 3),
				createBead('rd-p0', 'P0', 1),
				createBead('rd-p1', 'P1', 2),
				createBead('rd-p4', 'P4', 4),
			];

			const sorted = sortByPriority(beads);

			expect(sorted[0].priority).toBe('P0');
			expect(sorted[1].priority).toBe('P1');
			expect(sorted[2].priority).toBe('P2');
			expect(sorted[3].priority).toBe('P4');
		});

		it('should sort by createdAt as secondary sort (older first)', () => {
			const beads = [
				createBead('rd-p2', 'P1', 3),
				createBead('rd-p1a', 'P1', 1),
				createBead('rd-p1b', 'P1', 2),
			];

			const sorted = sortByPriority(beads);

			expect(sorted[0].id).toBe('rd-p1a');
			expect(sorted[1].id).toBe('rd-p1b');
			expect(sorted[2].id).toBe('rd-p2');
		});

		it('should not mutate the original array', () => {
			const beads = [
				createBead('rd-p1', 'P1', 1),
				createBead('rd-p0', 'P0', 2),
			];
			const original = [...beads];

			sortByPriority(beads);

			expect(beads[0].id).toBe(original[0].id);
		});
	});

	describe('formatBead', () => {
		const createBead = (
			id: string,
			title: string,
			type: BeadType,
			priority: BeadPriority,
			status: BeadStatus
		): Bead => ({
			id,
			title,
			description: '',
			type,
			priority,
			status,
			createdBy: 'test',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		it('should format with status emoji', () => {
			const statuses: BeadStatus[] = ['open', 'in_progress', 'done', 'blocked'];
			const emojis = ['⚪', '🔵', '✅', '🔴'];

			statuses.forEach((status, index) => {
				const bead = createBead('rd-abc12', 'Test', 'task', 'P2', status);
				const formatted = formatBead(bead);
				expect(formatted).toContain(emojis[index]);
			});
		});

		it('should format with type icon', () => {
			const types: BeadType[] = ['task', 'bug', 'feature', 'epic', 'question', 'docs'];
			const icons = ['📋', '🐛', '✨', '🎯', '❓', '📖'];

			types.forEach((type, index) => {
				const bead = createBead('rd-abc12', 'Test', type, 'P2', 'open');
				const formatted = formatBead(bead);
				expect(formatted).toContain(icons[index]);
			});
		});

		it('should include bead ID and priority', () => {
			const bead = createBead('rd-abc12', 'Test Bead', 'task', 'P1', 'open');
			const formatted = formatBead(bead);

			expect(formatted).toContain('rd-abc12');
			expect(formatted).toContain('[P1]');
			expect(formatted).toContain('Test Bead');
		});
	});

	describe('Bead interface structure', () => {
		it('should accept all valid bead types', () => {
			const types: BeadType[] = ['task', 'bug', 'feature', 'epic', 'question', 'docs'];
			types.forEach((type) => {
				const bead: Bead = {
					id: 'rd-abc12',
					title: 'Test',
					description: '',
					type,
					priority: 'P2',
					status: 'open',
					createdBy: 'test',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};
				expect(bead.type).toBe(type);
			});
		});

		it('should accept all valid priority levels', () => {
			const priorities: BeadPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
			priorities.forEach((priority) => {
				const bead: Bead = {
					id: 'rd-abc12',
					title: 'Test',
					description: '',
					type: 'task',
					priority,
					status: 'open',
					createdBy: 'test',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};
				expect(bead.priority).toBe(priority);
			});
		});

		it('should accept all valid status values', () => {
			const statuses: BeadStatus[] = ['open', 'in_progress', 'done', 'blocked'];
			statuses.forEach((status) => {
				const bead: Bead = {
					id: 'rd-abc12',
					title: 'Test',
					description: '',
					type: 'task',
					priority: 'P2',
					status,
					createdBy: 'test',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};
				expect(bead.status).toBe(status);
			});
		});

		it('should support optional fields', () => {
			const bead: Bead = {
				id: 'rd-abc12',
				title: 'Test',
				description: '',
				type: 'task',
				priority: 'P2',
				status: 'open',
				createdBy: 'test',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				assignee: 'agent-1',
				dependsOn: ['rd-def34'],
				tags: ['important', 'urgent'],
				metadata: { custom: 'value' },
			};

			expect(bead.assignee).toBe('agent-1');
			expect(bead.dependsOn).toEqual(['rd-def34']);
			expect(bead.tags).toEqual(['important', 'urgent']);
			expect(bead.metadata).toEqual({ custom: 'value' });
		});
	});
});