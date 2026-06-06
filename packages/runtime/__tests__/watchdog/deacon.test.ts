/**
 * Deacon Tests
 * Tests for the Watchdog supervisor class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Deacon, createDeacon } from '../../src/watchdog/deacon.js';
import { Witness } from '../../src/watchdog/witness.js';
import type { DogTask } from '../../src/watchdog/index.js';

function createHealthyWitness(agentId: string): Witness {
	const witness = new Witness({
		id: `wit-${agentId}`,
		name: `Witness ${agentId}`,
		agentId,
	});
	witness.recordHeartbeat();
	witness.recordProgress(50);
	return witness;
}

function createDegradedWitness(agentId: string): Witness {
	const witness = new Witness({
		id: `wit-${agentId}`,
		name: `Witness ${agentId}`,
		agentId,
	});
	witness.recordHeartbeat();
	witness.recordError(new Error('Minor error'));
	return witness;
}

function createDeadWitness(agentId: string): Witness {
	const witness = new Witness({
		id: `wit-${agentId}`,
		name: `Witness ${agentId}`,
		agentId,
	});
	// Record 6 errors (> DEAD_ERROR_COUNT of 5)
	for (let i = 0; i < 6; i++) {
		witness.recordError(new Error(`Error ${i}`));
	}
	return witness;
}

describe('Deacon', () => {
	let deacon: Deacon;

	beforeEach(() => {
		deacon = new Deacon();
	});

	afterEach(async () => {
		await deacon.shutdown();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			expect(deacon.getId()).toMatch(/^dea-[a-z0-9]{5}$/);
			expect(deacon.getConfig().patrolIntervalMs).toBe(60000);
			expect(deacon.getConfig().isActive).toBe(true);
		});

		it('should create with custom config', () => {
			const customDeacon = new Deacon({
				id: 'dea-custom',
				name: 'Custom Deacon',
				patrolIntervalMs: 30000,
				maxTasksPerCycle: 5,
				qualityThreshold: 0.9,
				isActive: false,
			});
			expect(customDeacon.getId()).toBe('dea-custom');
			expect(customDeacon.getConfig().name).toBe('Custom Deacon');
			expect(customDeacon.getConfig().patrolIntervalMs).toBe(30000);
			expect(customDeacon.getConfig().isActive).toBe(false);
		});

		it('should create with createDeacon factory', () => {
			const factoryDeacon = createDeacon({ name: 'Factory Deacon' });
			expect(factoryDeacon.getConfig().name).toBe('Factory Deacon');
		});
	});

	describe('witness registration', () => {
		it('should register a witness', () => {
			const witness = createHealthyWitness('agent-1');
			deacon.register('agent-1', witness);
			expect(deacon.getWitnessCount()).toBe(1);
			expect(deacon.getRegisteredAgents()).toContain('agent-1');
		});

		it('should register multiple witnesses', () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createHealthyWitness('agent-2'));
			deacon.register('agent-3', createHealthyWitness('agent-3'));
			expect(deacon.getWitnessCount()).toBe(3);
			expect(deacon.getRegisteredAgents()).toHaveLength(3);
		});

		it('should replace existing witness for same agent', () => {
			const witness1 = createHealthyWitness('agent-1');
			const witness2 = createDegradedWitness('agent-1');
			deacon.register('agent-1', witness1);
			deacon.register('agent-1', witness2);
			expect(deacon.getWitnessCount()).toBe(1);
		});

		it('should unregister a witness', () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.unregister('agent-1');
			expect(deacon.getWitnessCount()).toBe(0);
			expect(deacon.getRegisteredAgents()).not.toContain('agent-1');
		});

		it('should clear pending tasks when unregistering', async () => {
			deacon.register('agent-dead', createDeadWitness('agent-dead'));
			await deacon.patrol(); // Dispatches recovery dog
			expect(deacon.getPendingTaskCount()).toBe(1);
			deacon.unregister('agent-dead');
			expect(deacon.getPendingTaskCount()).toBe(0);
		});
	});

	describe('patrol cycle', () => {
		it('should return report with no witnesses', async () => {
			const report = await deacon.patrol();
			expect(report.isCompleted).toBe(true);
			expect(report.meetsStandards).toBe(true);
			expect(report.metadata.totalWitnesses).toBe(0);
		});

		it('should count healthy agents', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createHealthyWitness('agent-2'));
			const report = await deacon.patrol();
			expect(report.metadata.healthyCount).toBe(2);
			expect(report.metadata.degradedCount).toBe(0);
			expect(report.metadata.stalledCount).toBe(0);
			expect(report.metadata.deadCount).toBe(0);
		});

		it('should count degraded agents', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDegradedWitness('agent-2'));
			const report = await deacon.patrol();
			expect(report.metadata.healthyCount).toBe(1);
			expect(report.metadata.degradedCount).toBe(1);
		});

		it('should count dead agents', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDeadWitness('agent-2'));
			const report = await deacon.patrol();
			expect(report.metadata.deadCount).toBe(1);
		});

		it('should mark patrol as incomplete when dead agents exist', async () => {
			deacon.register('agent-dead', createDeadWitness('agent-dead'));
			const report = await deacon.patrol();
			expect(report.isCompleted).toBe(false);
		});

		it('should mark patrol as not meeting standards when critical', async () => {
			deacon.register('agent-dead', createDeadWitness('agent-dead'));
			const report = await deacon.patrol();
			expect(report.meetsStandards).toBe(false);
		});

		it('should increment patrol count', async () => {
			await deacon.patrol();
			await deacon.patrol();
			await deacon.patrol();
			expect(deacon.getPatrolCount()).toBe(3);
		});

		it('should update last patrol time', async () => {
			const before = Date.now();
			await deacon.patrol();
			const after = Date.now();
			expect(deacon.getLastPatrolTime()).toBeGreaterThanOrEqual(before);
			expect(deacon.getLastPatrolTime()).toBeLessThanOrEqual(after);
		});
	});

	describe('health aggregation', () => {
		it('should return healthy when all agents healthy', () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createHealthyWitness('agent-2'));
			expect(deacon.getOverallHealth()).toBe('healthy');
		});

		it('should return degraded when any agent degraded', () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDegradedWitness('agent-2'));
			expect(deacon.getOverallHealth()).toBe('degraded');
		});

		it('should return critical when any agent dead', () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDeadWitness('agent-2'));
			expect(deacon.getOverallHealth()).toBe('critical');
		});

		it('should return healthy when no witnesses registered', () => {
			expect(deacon.getOverallHealth()).toBe('healthy');
		});

		it('should get agents by health status', () => {
			deacon.register('agent-h', createHealthyWitness('agent-h'));
			deacon.register('agent-d', createDegradedWitness('agent-d'));
			deacon.register('agent-x', createDeadWitness('agent-x'));

			expect(deacon.getAgentsByHealth('healthy')).toContain('agent-h');
			expect(deacon.getAgentsByHealth('degraded')).toContain('agent-d');
			expect(deacon.getAgentsByHealth('dead')).toContain('agent-x');
		});

		it('should get all reports', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDegradedWitness('agent-2'));
			const reports = deacon.getAllReports();
			expect(reports).toHaveLength(2);
			expect(reports.map(r => r.healthStatus)).toContain('healthy');
			expect(reports.map(r => r.healthStatus)).toContain('degraded');
		});
	});

	describe('dog dispatch', () => {
		it('should dispatch recovery dog for dead agent', async () => {
			const dispatchedTasks: DogTask[] = [];
			deacon.onDogDispatch((task) => dispatchedTasks.push(task));

			deacon.register('agent-dead', createDeadWitness('agent-dead'));
			await deacon.patrol();

			expect(dispatchedTasks).toHaveLength(1);
			expect(dispatchedTasks[0].assignedAgentId).toBe('agent-dead');
			expect(dispatchedTasks[0].priority).toBe('P0');
		});

		it('should not dispatch duplicate dogs for same agent', async () => {
			const dispatchedTasks: DogTask[] = [];
			deacon.onDogDispatch((task) => dispatchedTasks.push(task));

			deacon.register('agent-dead', createDeadWitness('agent-dead'));
			await deacon.patrol();
			await deacon.patrol();
			await deacon.patrol();

			expect(dispatchedTasks.filter(t => t.assignedAgentId === 'agent-dead')).toHaveLength(1);
		});

		it('should track pending tasks', async () => {
			deacon.register('agent-1', createDeadWitness('agent-1'));
			deacon.register('agent-2', createDeadWitness('agent-2'));
			await deacon.patrol();

			expect(deacon.getPendingTaskCount()).toBe(2);
			const tasks = deacon.getPendingTasks();
			expect(tasks).toHaveLength(2);
		});

		it('should complete pending task', async () => {
			deacon.register('agent-1', createDeadWitness('agent-1'));
			await deacon.patrol();
			expect(deacon.getPendingTaskCount()).toBe(1);

			deacon.completeTask('agent-1');
			expect(deacon.getPendingTaskCount()).toBe(0);
		});

		it('should allow new dog dispatch after task completion', async () => {
			deacon.register('agent-1', createDeadWitness('agent-1'));
			await deacon.patrol();
			deacon.completeTask('agent-1');
			await deacon.patrol();

			expect(deacon.getPendingTaskCount()).toBe(1);
		});
	});

	describe('lifecycle', () => {
		it('should not be active by default', () => {
			expect(deacon.isActive()).toBe(false);
		});

		it('should start patrol cycles', async () => {
			vi.useFakeTimers();
			deacon.register('agent-1', createHealthyWitness('agent-1'));

			await deacon.start();

			expect(deacon.isActive()).toBe(true);
			expect(deacon.getPatrolCount()).toBe(1); // Initial patrol ran

			await deacon.stop();
			expect(deacon.isActive()).toBe(false);
		});

		it('should not start if already running', async () => {
			vi.useFakeTimers();
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			await deacon.start();
			const firstPatrolCount = deacon.getPatrolCount();

			await deacon.start();
			expect(deacon.getPatrolCount()).toBe(firstPatrolCount);

			await deacon.stop();
		});

		it('should stop if not running', async () => {
			await deacon.stop();
			expect(deacon.isActive()).toBe(false);
		});

		it('should reset all state', async () => {
			deacon.register('agent-1', createDeadWitness('agent-1'));
			await deacon.patrol();
			expect(deacon.getWitnessCount()).toBe(1);
			expect(deacon.getPatrolCount()).toBe(1);

			deacon.reset();
			expect(deacon.getWitnessCount()).toBe(0);
			expect(deacon.getPatrolCount()).toBe(0);
			expect(deacon.getLastPatrolTime()).toBe(0);
		});

		it('should shutdown completely', async () => {
			vi.useFakeTimers();
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			await deacon.start();

			await deacon.shutdown();

			expect(deacon.isActive()).toBe(false);
			expect(deacon.getWitnessCount()).toBe(0);
			expect(deacon.getPatrolCount()).toBe(0);
		});
	});

	describe('callbacks', () => {
		it('should call patrol callback', async () => {
			const patrolReports: any[] = [];
			deacon.onPatrol((report) => patrolReports.push(report));

			deacon.register('agent-1', createHealthyWitness('agent-1'));
			await deacon.patrol();
			await deacon.patrol();

			expect(patrolReports).toHaveLength(2);
		});

		it('should call health change callback', async () => {
			const healthChanges: any[] = [];
			deacon.onHealthChange((old, newHealth) => healthChanges.push({ old, newHealth }));

			deacon.register('agent-1', createHealthyWitness('agent-1'));
			await deacon.patrol();

			deacon.register('agent-2', createDegradedWitness('agent-2'));
			await deacon.patrol();

			expect(healthChanges.some(h => h.newHealth === 'degraded')).toBe(true);
		});

		it('should return unsubscribe function', () => {
			const callback = vi.fn();
			const unsubscribe = deacon.onPatrol(callback);
			unsubscribe();

			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.patrol();

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('confidence calculation', () => {
		it('should calculate high confidence for all healthy', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			const report = await deacon.patrol();
			expect(report.confidence).toBeGreaterThan(0.9);
		});

		it('should calculate lower confidence with dead agents', async () => {
			deacon.register('agent-1', createHealthyWitness('agent-1'));
			deacon.register('agent-2', createDeadWitness('agent-2'));
			const report = await deacon.patrol();
			expect(report.confidence).toBeLessThan(1.0);
		});

		it('should return 1.0 confidence with no witnesses', async () => {
			const report = await deacon.patrol();
			expect(report.confidence).toBe(1.0);
		});
	});
});