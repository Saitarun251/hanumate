/**
 * Hook Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
	type Hook,
	type HookStatus,
	type HookCreateOptions,
	generateHookId,
	createHook,
} from '../../src/hooks/hook-types.ts';

describe('Hook Types', () => {
	describe('generateHookId', () => {
		it('should generate unique hook IDs', () => {
			const id1 = generateHookId();
			const id2 = generateHookId();

			expect(id1).not.toBe(id2);
		});

		it('should start with hook_ prefix', () => {
			const id = generateHookId();
			expect(id.startsWith('hook_')).toBe(true);
		});

		it('should contain timestamp and random part', () => {
			const id = generateHookId();
			expect(id).toMatch(/^hook_\d+_[a-z0-9]+$/);
		});
	});

	describe('createHook', () => {
		it('should create hook with required fields', () => {
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
			};

			const hook = createHook(options);

			expect(hook.id).toMatch(/^hook_/);
			expect(hook.agentId).toBe('agent-1');
			expect(hook.beadId).toBe('bead-123');
			expect(hook.status).toBe('pending');
			expect(hook.assignedAt).toBeDefined();
		});

		it('should set default status to pending', () => {
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
			};

			const hook = createHook(options);
			expect(hook.status).toBe('pending');
		});

		it('should allow custom status', () => {
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
				status: 'active',
			};

			const hook = createHook(options);
			expect(hook.status).toBe('active');
		});

		it('should include metadata when provided', () => {
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
				metadata: { priority: 'high', tags: ['urgent'] },
			};

			const hook = createHook(options);
			expect(hook.metadata).toEqual({ priority: 'high', tags: ['urgent'] });
		});

		it('should not include metadata when not provided', () => {
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
			};

			const hook = createHook(options);
			expect(hook.metadata).toBeUndefined();
		});

		it('should set assignedAt to current timestamp', () => {
			const before = Date.now();
			const options: HookCreateOptions = {
				agentId: 'agent-1',
				beadId: 'bead-123',
			};
			const hook = createHook(options);
			const after = Date.now();

			expect(hook.assignedAt).toBeGreaterThanOrEqual(before);
			expect(hook.assignedAt).toBeLessThanOrEqual(after);
		});
	});

	describe('Hook interface structure', () => {
		it('should accept valid hook status values', () => {
			const statuses: HookStatus[] = ['pending', 'active', 'completed', 'stalled'];
			
			statuses.forEach((status) => {
				const options: HookCreateOptions = {
					agentId: 'agent-1',
					beadId: 'bead-123',
					status,
				};
				const hook = createHook(options);
				expect(hook.status).toBe(status);
			});
		});
	});
});