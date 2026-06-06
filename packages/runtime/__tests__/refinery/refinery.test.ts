/**
 * Refinery Tests
 * Tests for the merge queue system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RefineryQueue } from '../../src/refinery/refinery-queue.js';
import { Refinery, CiGate, LintGate, CoverageGate } from '../../src/refinery/refinery.js';
import type { MergeRequest, MergeStatus } from '../../src/refinery/refinery-types.js';

describe('RefineryQueue', () => {
	let queue: RefineryQueue;
	const testDir = '.hanumate/test-refinery-' + Date.now();

	beforeEach(async () => {
		queue = new RefineryQueue({
			storageDir: testDir,
			batchSize: 5,
		});
		await queue.init();
		await queue.clear();
	});

	afterEach(async () => {
		// Cleanup handled by unique directory per test run
	});

	describe('enqueue', () => {
		it('should add a merge request to the queue', async () => {
			const mr: MergeRequest = {
				id: 'mr-test1',
				branch: 'feature/test',
				author: 'test-user',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await queue.enqueue(mr);
			const size = await queue.size();
			expect(size).toBe(1);
		});

		it('should auto-generate ID if not provided', async () => {
			const mr: MergeRequest = {
				branch: 'feature/test',
				author: 'test-user',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await queue.enqueue(mr);
			expect(mr.id).toMatch(/^mr-[a-z0-9]{5}$/);
		});
	});

	describe('dequeue', () => {
		it('should return null when queue is empty', async () => {
			const mr = await queue.dequeue();
			expect(mr).toBeNull();
		});

		it('should return and remove the first MR', async () => {
			const mr1: MergeRequest = {
				id: 'mr-1',
				branch: 'feature/a',
				author: 'user1',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			const mr2: MergeRequest = {
				id: 'mr-2',
				branch: 'feature/b',
				author: 'user2',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await queue.enqueue(mr1);
			await queue.enqueue(mr2);

			const dequeued = await queue.dequeue();
			expect(dequeued?.id).toBe('mr-1');
			expect(dequeued?.status).toBe('testing');

			const size = await queue.size();
			expect(size).toBe(1);
		});
	});

	describe('peek', () => {
		it('should return null when queue is empty', async () => {
			const mr = await queue.peek();
			expect(mr).toBeNull();
		});

		it('should return first MR without removing it', async () => {
			const mr: MergeRequest = {
				id: 'mr-peek',
				branch: 'feature/peek',
				author: 'user',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await queue.enqueue(mr);
			const peeked = await queue.peek();
			expect(peeked?.id).toBe('mr-peek');

			const size = await queue.size();
			expect(size).toBe(1);
		});
	});

	describe('updateStatus', () => {
		it('should update MR status', async () => {
			const mr: MergeRequest = {
				id: 'mr-status',
				branch: 'feature/status',
				author: 'user',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await queue.enqueue(mr);
			await queue.updateStatus('mr-status', 'passed');

			const updated = await queue.get('mr-status');
			expect(updated?.status).toBe('passed');
		});
	});

	describe('getPending', () => {
		it('should return all pending MRs', async () => {
			await queue.enqueue({
				id: 'mr-p1',
				branch: 'a',
				author: 'u',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await queue.enqueue({
				id: 'mr-p2',
				branch: 'b',
				author: 'u',
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});

			const pending = await queue.getPending();
			expect(pending).toHaveLength(2);
		});
	});

	describe('getStats', () => {
		it('should return queue statistics', async () => {
			const stats = await queue.getStats();
			expect(stats).toEqual({
				pending: 0,
				testing: 0,
				passed: 0,
				failed: 0,
				merged: 0,
				total: 0,
			});
		});
	});
});

describe('Refinery', () => {
	let refinery: Refinery;
	const testDir = '.hanumate/test-refinery-core-' + Date.now();

	beforeEach(async () => {
		refinery = new Refinery({
			storageDir: testDir,
			maxConcurrency: 2,
			batchSize: 5,
		});
		await refinery.init();
		await refinery.clear();
	});

	afterEach(() => {
		refinery.stop();
	});

	describe('enqueue', () => {
		it('should add a merge request to the queue', async () => {
			const mr = await refinery.enqueue('feature/test', 'test-user');
			expect(mr.id).toMatch(/^mr-/);
			expect(mr.branch).toBe('feature/test');
			expect(mr.author).toBe('test-user');
			expect(mr.status).toBe('pending');
		});

		it('should associate with bead and convoy', async () => {
			const mr = await refinery.enqueue('feature/test', 'test-user', {
				beadId: 'rd-test1',
				convoyId: 'cv-test1',
			});
			expect(mr.beadId).toBe('rd-test1');
			expect(mr.convoyId).toBe('cv-test1');
		});
	});

	describe('getStatus', () => {
		it('should return current status', async () => {
			const status = await refinery.getStatus();
			expect(status).toEqual({
				queueSize: 0,
				testing: 0,
				passed: 0,
				failed: 0,
				merged: 0,
			});
		});
	});

	describe('addGate', () => {
		it('should add custom verification gate', async () => {
			const customGate = {
				name: 'custom-gate',
				priority: 1,
				run: async () => ({
					passed: true,
					name: 'custom-gate',
					details: 'OK',
					duration: 0,
				}),
			};

			refinery.addGate(customGate);
			const status = await refinery.getStatus();
			expect(status).toBeDefined();
		});
	});

	describe('cancel', () => {
		it('should cancel a merge request', async () => {
			const mr = await refinery.enqueue('feature/cancel', 'test-user');
			await refinery.cancel(mr.id);

			const updated = await refinery.getMergeRequest(mr.id);
			expect(updated?.status).toBe('cancelled');
		});
	});
});

describe('VerificationGates', () => {
	describe('CiGate', () => {
		it('should have correct name', () => {
			const gate = new CiGate();
			expect(gate.name).toBe('ci');
		});

		it('should have priority', () => {
			const gate = new CiGate();
			expect(gate.priority).toBe(10);
		});
	});

	describe('LintGate', () => {
		it('should have correct name', () => {
			const gate = new LintGate();
			expect(gate.name).toBe('lint');
		});

		it('should have priority', () => {
			const gate = new LintGate();
			expect(gate.priority).toBe(5);
		});
	});

	describe('CoverageGate', () => {
		it('should have correct name', () => {
			const gate = new CoverageGate();
			expect(gate.name).toBe('coverage');
		});

		it('should have priority', () => {
			const gate = new CoverageGate();
			expect(gate.priority).toBe(15);
		});
	});
});