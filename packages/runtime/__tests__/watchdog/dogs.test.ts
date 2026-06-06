/**
 * Dogs Tests
 * Tests for the Watchdog infrastructure helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
	runBootDog,
	runCleanupDog,
	runHealthDog,
} from '../../src/watchdog/dogs/index.js';
import type {
	WitnessReport,
	DeaconConfig,
	CleanupDogOptions,
} from '../../src/watchdog/index.js';

// Mock session store for cleanup tests
function createMockSessionStore(sessions: Array<{ id: string; updatedAt: number; expiresAt?: number }>) {
	return {
		list: () => Promise.resolve(sessions.map(s => s.id)),
		load: async (id: string) => {
			const session = sessions.find(s => s.id === id);
			return session ? { id: session.id, updatedAt: session.updatedAt, expiresAt: session.expiresAt } : null;
		},
		save: async () => {},
		delete: async () => {},
	};
}

function makeReport(
	id: string,
	status: 'healthy' | 'degraded' | 'stalled' | 'dead',
	agentId = 'agent-1'
): WitnessReport {
	return {
		id,
		agentId,
		healthStatus: status,
		timestamp: Date.now(),
		isResponsive: status !== 'dead',
		lastActivityAt: Date.now() - 1000,
		failedChecks: status === 'dead' ? 5 : 0,
		details: `${id} is ${status}`,
		metadata: {
			name: id,
			currentProgress: 50,
			lastProgressUpdate: Date.now() - 1000,
			recentErrors: [],
		},
	};
}

function makeDeaconConfig(overrides: Partial<DeaconConfig> = {}): DeaconConfig {
	return {
		id: 'dea-test1',
		name: 'Test Deacon',
		patrolIntervalMs: 60_000,
		maxTasksPerCycle: 10,
		qualityThreshold: 0.8,
		isActive: true,
		...overrides,
	};
}

describe('runBootDog', () => {
	it('should pass when deacon config is valid and active', () => {
		const config = makeDeaconConfig({ isActive: true });
		const result = runBootDog(config);
		expect(result.success).toBe(true);
		expect(result.data?.isReady).toBe(true);
		expect(result.data?.healthStatus).toBe('healthy');
	});

	it('should fail when deacon ID format is invalid', () => {
		const config = makeDeaconConfig({ id: 'invalid-id' });
		const result = runBootDog(config);
		expect(result.success).toBe(false);
		expect(result.error).toContain('Invalid deacon ID format');
	});

	it('should fail when deacon name is empty', () => {
		const config = makeDeaconConfig({ name: '' });
		const result = runBootDog(config);
		expect(result.success).toBe(false);
		expect(result.error).toContain('name is required');
	});

	it('should return degraded when deacon is inactive', () => {
		const config = makeDeaconConfig({ isActive: false });
		const result = runBootDog(config);
		expect(result.success).toBe(true); // Still succeeds, just degraded
		expect(result.data?.healthStatus).toBe('degraded');
	});

	it('should fail when patrol interval is too short', () => {
		const config = makeDeaconConfig({ patrolIntervalMs: 1000 });
		const result = runBootDog(config);
		expect(result.success).toBe(true);
		expect(result.data?.checks.some((c: { name: string; passed: boolean }) => c.name === 'patrol_interval' && !c.passed)).toBe(true);
	});

	it('should fail when patrol interval is too long', () => {
		const config = makeDeaconConfig({ patrolIntervalMs: 4_000_000 });
		const result = runBootDog(config);
		expect(result.success).toBe(true);
		expect(result.data?.checks.some((c: { name: string; passed: boolean }) => c.name === 'patrol_interval' && !c.passed)).toBe(true);
	});

	it('should fail when quality threshold is out of range', () => {
		const config = makeDeaconConfig({ qualityThreshold: 1.5 });
		const result = runBootDog(config);
		expect(result.data?.checks.some((c: { name: string; passed: boolean }) => c.name === 'quality_threshold' && !c.passed)).toBe(true);
	});

	it('should include all check results', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(result.data?.checks).toBeDefined();
		expect(Array.isArray(result.data?.checks)).toBe(true);
	});

	it('should always include timestamp', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(result.timestamp).toBeGreaterThan(0);
	});

	it('should include logs array', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(Array.isArray(result.logs)).toBe(true);
	});
});

describe('runCleanupDog', () => {
	it('should succeed with empty session store', async () => {
		const mockStore = createMockSessionStore([]);
		const options: CleanupDogOptions = { sessionStore: mockStore };
		const result = await runCleanupDog(options);
		expect(result.success).toBe(true);
		expect(result.data?.totalScanned).toBe(0);
		expect(result.data?.cleaned).toBe(0);
	});

	it('should skip sessions newer than maxAgeMs', async () => {
		const now = Date.now();
		const mockStore = createMockSessionStore([
			{ id: 'session-new', updatedAt: now - 1000 }, // 1 second old
		]);
		const options: CleanupDogOptions = {
			sessionStore: mockStore,
			maxAgeMs: 86_400_000, // 1 day
			dryRun: true,
		};
		const result = await runCleanupDog(options);
		expect(result.success).toBe(true);
		expect(result.data?.skipped).toBe(1);
	});

	it('should remove sessions older than maxAgeMs', async () => {
		const now = Date.now();
		const mockStore = createMockSessionStore([
			{ id: 'session-old', updatedAt: now - 8 * 86_400_000 }, // 8 days old
		]);
		const options: CleanupDogOptions = {
			sessionStore: mockStore,
			maxAgeMs: 7 * 86_400_000, // 7 days
			dryRun: false,
		};
		const result = await runCleanupDog(options);
		expect(result.success).toBe(true);
		expect(result.data?.cleaned).toBe(1);
	});

	it('should handle dry run mode', async () => {
		const now = Date.now();
		const mockStore = createMockSessionStore([
			{ id: 'session-old', updatedAt: now - 8 * 86_400_000 },
		]);
		const options: CleanupDogOptions = {
			sessionStore: mockStore,
			maxAgeMs: 7 * 86_400_000,
			dryRun: true, // Don't actually delete
		};
		const result = await runCleanupDog(options);
		expect(result.success).toBe(true);
		expect(result.data!.dryRun).toBe(true);
		// In dry run, cleaned count is incremented but nothing is actually deleted
		// The important thing is dryRun flag is set and nothing was actually removed
	});

	it('should process in batches', async () => {
		const now = Date.now();
		const sessions = Array.from({ length: 150 }, (_, i) => ({
			id: `session-${i}`,
			updatedAt: now - 8 * 86_400_000,
		}));
		const mockStore = createMockSessionStore(sessions);
		const options: CleanupDogOptions = {
			sessionStore: mockStore,
			maxAgeMs: 7 * 86_400_000,
			batchSize: 50,
		};
		const result = await runCleanupDog(options);
		expect(result.success).toBe(true);
		// totalScanned counts all sessions, but only batchSize are actually processed
		expect(result.data!.totalScanned).toBe(150);
		expect(result.data!.cleaned).toBe(50); // Only batchSize processed
	});

	it('should include session info in summary', async () => {
		const now = Date.now();
		const mockStore = createMockSessionStore([
			{ id: 'session-old', updatedAt: now - 8 * 86_400_000 },
		]);
		const options: CleanupDogOptions = {
			sessionStore: mockStore,
			maxAgeMs: 7 * 86_400_000,
		};
		const result = await runCleanupDog(options);
		expect(result.data?.summary).toBeDefined();
		expect(typeof result.data?.summary).toBe('string');
	});
});

describe('runHealthDog', () => {
	it('should return error when no witnesses provided', () => {
		const result = runHealthDog([]);
		expect(result.success).toBe(false);
		expect(result.error).toContain('No witness');
	});

	it('should aggregate reports into summary', () => {
		const reports: WitnessReport[] = [
			makeReport('wit-1', 'healthy'),
			makeReport('wit-2', 'degraded'),
			makeReport('wit-3', 'stalled'),
			makeReport('wit-4', 'dead'),
			makeReport('wit-5', 'healthy'),
		];
		const result = runHealthDog(reports);
		expect(result.success).toBe(true);
		expect(result.data?.stats.totalWitnesses).toBe(5);
		expect(result.data?.stats.byStatus.healthy).toBe(2);
		expect(result.data?.stats.byStatus.degraded).toBe(1);
		expect(result.data?.stats.byStatus.stalled).toBe(1);
		expect(result.data?.stats.byStatus.dead).toBe(1);
	});

	it('should return empty stats for no reports', () => {
		const result = runHealthDog([]);
		expect(result.success).toBe(false);
		expect(result.data?.stats.totalWitnesses).toBe(0);
	});

	it('should handle all-healthy scenario', () => {
		const reports = [
			makeReport('wit-a', 'healthy'),
			makeReport('wit-b', 'healthy'),
		];
		const result = runHealthDog(reports);
		expect(result.success).toBe(true);
		expect(result.data?.overallStatus).toBe('healthy');
	});

	it('should handle all-dead scenario', () => {
		const reports = [
			makeReport('wit-x', 'dead'),
			makeReport('wit-y', 'dead'),
		];
		const result = runHealthDog(reports);
		expect(result.success).toBe(true);
		expect(result.data?.overallStatus).toBe('dead');
	});

	it('should include recommendations', () => {
		const reports = [makeReport('wit-1', 'degraded')];
		const result = runHealthDog(reports);
		expect(result.data?.recommendations).toBeDefined();
		expect(Array.isArray(result.data?.recommendations)).toBe(true);
	});

	it('should mark stale reports', () => {
		const oldReport = makeReport('wit-stale', 'healthy');
		oldReport.lastActivityAt = Date.now() - 600_000; // 10 minutes ago
		const result = runHealthDog([oldReport], { reportMaxAgeMs: 300_000 }); // 5 min max age
		expect(result.data?.witnessReports[0].isStale).toBe(true);
	});

	it('should include human-readable summary', () => {
		const reports = [makeReport('wit-final', 'healthy')];
		const result = runHealthDog(reports);
		expect(result.success).toBe(true);
		expect(typeof result.data?.summary).toBe('string');
		expect(result.data?.summary.length).toBeGreaterThan(0);
	});

	it('should always include timestamp', () => {
		const result = runHealthDog([makeReport('wit-1', 'healthy')]);
		expect(result.timestamp).toBeGreaterThan(0);
	});

	it('should include logs array', () => {
		const result = runHealthDog([makeReport('wit-1', 'healthy')]);
		expect(Array.isArray(result.logs)).toBe(true);
	});
});

describe('DogResult structure', () => {
	it('should always include timestamp', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(result.timestamp).toBeGreaterThan(0);
	});

	it('should include logs array', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(Array.isArray(result.logs)).toBe(true);
	});

	it('should include warnings array', () => {
		const config = makeDeaconConfig();
		const result = runBootDog(config);
		expect(Array.isArray(result.warnings)).toBe(true);
	});
});