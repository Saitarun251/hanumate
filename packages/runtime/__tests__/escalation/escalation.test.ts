/**
 * Escalation Tests
 * Tests for the severity-routed issue escalation system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EscalationService } from '../../src/escalation/escalation.js';
import type { Severity, Escalation } from '../../src/escalation/escalation-types.js';

describe('EscalationService', () => {
	let service: EscalationService;
	const testDir = '.hanumate/test-escalations-' + Date.now();

	beforeEach(async () => {
		service = new EscalationService({
			storageDir: testDir,
		});
		await service.init();
		await service.clear();
	});

	afterEach(async () => {
		// Cleanup handled by unique directory per test run
	});

	describe('escalate', () => {
		it('should create a critical escalation', async () => {
			const esc = await service.escalate(
				'CRITICAL',
				'System down',
				'test-agent'
			);

			expect(esc.id).toMatch(/^esc-/);
			expect(esc.severity).toBe('CRITICAL');
			expect(esc.description).toBe('System down');
			expect(esc.reporter).toBe('test-agent');
			expect(esc.status).toBe('open');
			expect(esc.route).toBe('overseer');
		});

		it('should create a high escalation', async () => {
			const esc = await service.escalate(
				'HIGH',
				'Performance degraded',
				'test-agent'
			);

			expect(esc.severity).toBe('HIGH');
			expect(esc.route).toBe('mayor');
		});

		it('should create a medium escalation', async () => {
			const esc = await service.escalate(
				'MEDIUM',
				'Minor issue',
				'test-agent'
			);

			expect(esc.severity).toBe('MEDIUM');
			expect(esc.route).toBe('deacon');
		});

		it('should associate with beads', async () => {
			const esc = await service.escalate(
				'HIGH',
				'Bug in feature',
				'test-agent',
				{ relatedBeads: ['rd-bug1', 'rd-bug2'] }
			);

			expect(esc.relatedBeads).toEqual(['rd-bug1', 'rd-bug2']);
		});
	});

	describe('acknowledge', () => {
		it('should acknowledge an escalation', async () => {
			const esc = await service.escalate('CRITICAL', 'Test', 'test-agent');
			
			await service.acknowledge(esc.id, 'handler-agent');

			const updated = await service.get(esc.id);
			expect(updated?.status).toBe('acknowledged');
			expect(updated?.acknowledgedBy).toBe('handler-agent');
			expect(updated?.acknowledgedAt).toBeDefined();
		});

		it('should throw for non-existent escalation', async () => {
			await expect(
				service.acknowledge('esc-nonexistent', 'handler')
			).rejects.toThrow('not found');
		});

		it('should throw for already acknowledged escalation', async () => {
			const esc = await service.escalate('HIGH', 'Test', 'test-agent');
			await service.acknowledge(esc.id, 'handler1');
			
			await expect(
				service.acknowledge(esc.id, 'handler2')
			).rejects.toThrow('not open');
		});
	});

	describe('resolve', () => {
		it('should resolve an escalation', async () => {
			const esc = await service.escalate('MEDIUM', 'Test', 'test-agent');
			
			await service.resolve(esc.id, 'resolver-agent', 'Fixed the issue');

			const updated = await service.get(esc.id);
			expect(updated?.status).toBe('resolved');
			expect(updated?.resolvedBy).toBe('resolver-agent');
			expect(updated?.resolution).toBe('Fixed the issue');
		});

		it('should resolve without resolution text', async () => {
			const esc = await service.escalate('LOW', 'Test', 'test-agent');
			await service.resolve(esc.id, 'resolver');
			
			const updated = await service.get(esc.id);
			expect(updated?.status).toBe('resolved');
		});
	});

	describe('listOpen', () => {
		it('should list only open escalations', async () => {
			const esc1 = await service.escalate('CRITICAL', 'Test 1', 'agent');
			const esc2 = await service.escalate('HIGH', 'Test 2', 'agent');
			await service.escalate('MEDIUM', 'Test 3', 'agent');

			// Acknowledge one
			await service.acknowledge(esc1.id, 'handler');

			const open = await service.listOpen();
			expect(open).toHaveLength(2);
			expect(open.map(e => e.id)).not.toContain(esc1.id);
		});

		it('should sort by severity then time', async () => {
			await service.escalate('MEDIUM', 'Medium 1', 'agent');
			await service.escalate('CRITICAL', 'Critical', 'agent');
			await service.escalate('HIGH', 'High', 'agent');
			await service.escalate('MEDIUM', 'Medium 2', 'agent');

			const open = await service.listOpen();
			expect(open[0].severity).toBe('CRITICAL');
		});
	});

	describe('listBySeverity', () => {
		it('should list by severity', async () => {
			await service.escalate('CRITICAL', 'Crit 1', 'agent');
			await service.escalate('CRITICAL', 'Crit 2', 'agent');
			await service.escalate('HIGH', 'High', 'agent');

			const critical = await service.listBySeverity('CRITICAL');
			expect(critical).toHaveLength(2);
			expect(critical.every(e => e.severity === 'CRITICAL')).toBe(true);
		});
	});

	describe('listByRoute', () => {
		it('should list by route', async () => {
			await service.escalate('CRITICAL', 'Crit', 'agent'); // overseer
			await service.escalate('HIGH', 'High', 'agent'); // mayor
			await service.escalate('MEDIUM', 'Med', 'agent'); // deacon

			const deacon = await service.listByRoute('deacon');
			expect(deacon).toHaveLength(1);
			expect(deacon[0].route).toBe('deacon');
		});
	});

	describe('getCriticalCount', () => {
		it('should return count of critical open escalations', async () => {
			await service.escalate('CRITICAL', 'Crit 1', 'agent');
			await service.escalate('CRITICAL', 'Crit 2', 'agent');
			await service.escalate('HIGH', 'High', 'agent');

			expect(service.getCriticalCount()).toBe(2);
		});
	});

	describe('getHighCount', () => {
		it('should return count of high severity open escalations', async () => {
			await service.escalate('CRITICAL', 'Crit', 'agent');
			await service.escalate('HIGH', 'High 1', 'agent');
			await service.escalate('HIGH', 'High 2', 'agent');

			expect(service.getHighCount()).toBe(2);
		});
	});

	describe('get', () => {
		it('should return escalation by ID', async () => {
			const esc = await service.escalate('MEDIUM', 'Test', 'agent');
			const found = await service.get(esc.id);
			
			expect(found?.id).toBe(esc.id);
		});

		it('should return null for non-existent ID', async () => {
			const found = await service.get('esc-nonexistent');
			expect(found).toBeNull();
		});
	});

	describe('getAll', () => {
		it('should return all escalations', async () => {
			await service.escalate('CRITICAL', 'Test 1', 'agent');
			await service.escalate('HIGH', 'Test 2', 'agent');
			
			const all = await service.getAll();
			expect(all).toHaveLength(2);
		});
	});
});