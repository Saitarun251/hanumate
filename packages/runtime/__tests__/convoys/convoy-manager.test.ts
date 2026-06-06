/**
 * Convoy Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConvoyManager } from '../../src/convoys/convoy-manager';
import { ConvoyStore } from '../../src/convoys/convoy-store';

describe('ConvoyManager', () => {
	let manager: ConvoyManager;
	let testDir: string;

	beforeEach(() => {
		// Create a unique test directory for each test
		testDir = join('/tmp', `convoy-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
		mkdirSync(testDir, { recursive: true });
		manager = new ConvoyManager(testDir);
	});

	afterEach(async () => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('create()', () => {
		it('should create a new convoy with a generated ID', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1', 'rd-bead2']);

			expect(convoy).toBeDefined();
			expect(convoy.id).toMatch(/^cv-[a-z0-9]{5}$/);
			expect(convoy.name).toBe('Test Convoy');
			expect(convoy.beadIds).toEqual(['rd-bead1', 'rd-bead2']);
			expect(convoy.status).toBe('active');
			expect(convoy.createdBy).toBe('system');
			expect(convoy.createdAt).toBeGreaterThan(0);
		});

		it('should create a convoy with notifyOnComplete', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', [], {
				notify: ['agent-1', 'agent-2'],
			});

			expect(convoy.notifyOnComplete).toEqual(['agent-1', 'agent-2']);
		});

		it('should deduplicate bead IDs', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1', 'rd-bead1', 'rd-bead2']);

			expect(convoy.beadIds).toEqual(['rd-bead1', 'rd-bead2']);
			expect(convoy.beadIds.length).toBe(2);
		});

		it('should accept createdBy parameter', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', [], undefined, 'custom-agent');

			expect(convoy.createdBy).toBe('custom-agent');
		});
	});

	describe('get()', () => {
		it('should retrieve a convoy by ID', async () => {
			await manager.init();

			const created = await manager.create('Test Convoy', ['rd-bead1']);
			const retrieved = await manager.get(created.id);

			expect(retrieved).not.toBeNull();
			expect(retrieved!.id).toBe(created.id);
			expect(retrieved!.name).toBe('Test Convoy');
		});

		it('should return null for non-existent convoy', async () => {
			await manager.init();

			const result = await manager.get('cv-nonexistent');

			expect(result).toBeNull();
		});
	});

	describe('update()', () => {
		it('should update convoy name', async () => {
			await manager.init();

			const convoy = await manager.create('Original Name', ['rd-bead1']);
			const updated = await manager.update(convoy.id, { name: 'Updated Name' });

			expect(updated).not.toBeNull();
			expect(updated!.name).toBe('Updated Name');
		});

		it('should set completedAt when status is completed', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			expect(convoy.completedAt).toBeUndefined();

			const updated = await manager.update(convoy.id, { status: 'completed' });

			expect(updated!.completedAt).toBeGreaterThan(0);
		});

		it('should return null for non-existent convoy', async () => {
			await manager.init();

			const result = await manager.update('cv-nonexistent', { name: 'Test' });

			expect(result).toBeNull();
		});
	});

	describe('delete()', () => {
		it('should delete a convoy', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			const deleted = await manager.delete(convoy.id);

			expect(deleted).toBe(true);
			expect(await manager.get(convoy.id)).toBeNull();
		});

		it('should return false for non-existent convoy', async () => {
			await manager.init();

			const result = await manager.delete('cv-nonexistent');

			expect(result).toBe(false);
		});
	});

	describe('addBeads()', () => {
		it('should add beads to a convoy', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			const updated = await manager.addBeads(convoy.id, ['rd-bead2', 'rd-bead3']);

			expect(updated).not.toBeNull();
			expect(updated!.beadIds).toContain('rd-bead1');
			expect(updated!.beadIds).toContain('rd-bead2');
			expect(updated!.beadIds).toContain('rd-bead3');
		});

		it('should deduplicate beads when adding', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			const updated = await manager.addBeads(convoy.id, ['rd-bead1', 'rd-bead2']);

			expect(updated!.beadIds).toEqual(['rd-bead1', 'rd-bead2']);
		});

		it('should return null for non-existent convoy', async () => {
			await manager.init();

			const result = await manager.addBeads('cv-nonexistent', ['rd-bead1']);

			expect(result).toBeNull();
		});
	});

	describe('removeBeads()', () => {
		it('should remove beads from a convoy', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1', 'rd-bead2', 'rd-bead3']);
			const updated = await manager.removeBeads(convoy.id, ['rd-bead2']);

			expect(updated).not.toBeNull();
			expect(updated!.beadIds).toContain('rd-bead1');
			expect(updated!.beadIds).toContain('rd-bead3');
			expect(updated!.beadIds).not.toContain('rd-bead2');
		});

		it('should return null for non-existent convoy', async () => {
			await manager.init();

			const result = await manager.removeBeads('cv-nonexistent', ['rd-bead1']);

			expect(result).toBeNull();
		});
	});

	describe('land()', () => {
		it('should land a convoy', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			const landed = await manager.land(convoy.id);

			expect(landed).not.toBeNull();
			expect(landed!.status).toBe('landed');
			expect(landed!.completedAt).toBeGreaterThan(0);
		});
	});

	describe('complete()', () => {
		it('should complete a convoy', async () => {
			await manager.init();

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			const completed = await manager.complete(convoy.id);

			expect(completed).not.toBeNull();
			expect(completed!.status).toBe('completed');
			expect(completed!.completedAt).toBeGreaterThan(0);
		});
	});

	describe('list()', () => {
		it('should list all convoys', async () => {
			await manager.init();

			await manager.create('Convoy 1', ['rd-bead1']);
			await manager.create('Convoy 2', ['rd-bead2']);
			await manager.create('Convoy 3', ['rd-bead3']);

			const convoys = await manager.list();

			expect(convoys.length).toBe(3);
		});

		it('should filter by status', async () => {
			await manager.init();

			const convoy1 = await manager.create('Active Convoy', ['rd-bead1']);
			await manager.create('Completed Convoy', ['rd-bead2']);
			await manager.complete(convoy1.id);

			const activeConvoys = await manager.list({ status: 'active' });
			const completedConvoys = await manager.list({ status: 'completed' });

			expect(activeConvoys.length).toBe(1);
			expect(activeConvoys[0].status).toBe('active');
			expect(completedConvoys.length).toBe(1);
			expect(completedConvoys[0].status).toBe('completed');
		});

		it('should filter by beadId', async () => {
			await manager.init();

			const convoy1 = await manager.create('Convoy 1', ['rd-bead1', 'rd-bead2']);
			const convoy2 = await manager.create('Convoy 2', ['rd-bead3']);

			await manager.addBeads(convoy1.id, ['rd-bead3']);

			const withBead = await manager.list({ beadId: 'rd-bead3' });

			expect(withBead.length).toBe(2);
		});

		it('should filter by createdBy', async () => {
			await manager.init();

			await manager.create('Convoy 1', ['rd-bead1'], undefined, 'agent-1');
			await manager.create('Convoy 2', ['rd-bead2'], undefined, 'agent-2');

			const byAgent1 = await manager.list({ createdBy: 'agent-1' });

			expect(byAgent1.length).toBe(1);
			expect(byAgent1[0].createdBy).toBe('agent-1');
		});

		it('should sort by createdAt descending', async () => {
			await manager.init();

			const convoy1 = await manager.create('First Convoy', ['rd-bead1']);
			await new Promise((resolve) => setTimeout(resolve, 10));
			const convoy2 = await manager.create('Second Convoy', ['rd-bead2']);

			const convoys = await manager.list();

			expect(convoys[0].id).toBe(convoy2.id);
			expect(convoys[1].id).toBe(convoy1.id);
		});
	});

	describe('getActive()', () => {
		it('should return only active convoys', async () => {
			await manager.init();

			const convoy1 = await manager.create('Active', ['rd-bead1']);
			const convoy2 = await manager.create('Active 2', ['rd-bead2']);
			await manager.complete(convoy1.id);

			const active = await manager.getActive();

			// Only convoy2 should be active (convoy1 was completed)
			expect(active.length).toBe(1);
			expect(active[0].id).toBe(convoy2.id);
			expect(active.every((c) => c.status === 'active')).toBe(true);
		});
	});

	describe('getByBead()', () => {
		it('should return convoys containing the bead', async () => {
			await manager.init();

			const convoy1 = await manager.create('Convoy 1', ['rd-shared', 'rd-bead1']);
			const convoy2 = await manager.create('Convoy 2', ['rd-shared', 'rd-bead2']);
			await manager.create('Convoy 3', ['rd-bead3']);

			const convoys = await manager.getByBead('rd-shared');

			expect(convoys.length).toBe(2);
			expect(convoys.map((c) => c.id).sort()).toEqual([convoy1.id, convoy2.id].sort());
		});
	});

	describe('onChange()', () => {
		it('should notify listeners on create', async () => {
			await manager.init();

			const events: string[] = [];
			manager.onChange((event) => {
				events.push(event.type);
			});

			await manager.create('Test Convoy', ['rd-bead1']);

			expect(events).toContain('created');
		});

		it('should notify listeners on addBeads', async () => {
			await manager.init();

			const events: string[] = [];
			manager.onChange((event) => {
				events.push(event.type);
			});

			const convoy = await manager.create('Test Convoy', ['rd-bead1']);
			await manager.addBeads(convoy.id, ['rd-bead2']);

			expect(events).toContain('bead_added');
		});

		it('should return unsubscribe function', () => {
			const unsubscribe = manager.onChange(() => {});
			const removed = unsubscribe();

			expect(removed).toBe(true);
		});
	});

	describe('getStoragePath()', () => {
		it('should return the storage directory path', async () => {
			await manager.init();

			const path = manager.getStoragePath();

			expect(path).toBe(testDir);
		});
	});
});

describe('ConvoyStore', () => {
	let store: ConvoyStore;
	let testDir: string;

	beforeEach(() => {
		testDir = join('/tmp', `store-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
		mkdirSync(testDir, { recursive: true });
		store = new ConvoyStore(testDir);
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('save() and load()', () => {
		it('should save and load a convoy', async () => {
			await store.init();

			const convoy = {
				id: 'cv-abc12',
				name: 'Test Convoy',
				beadIds: ['rd-bead1'],
				status: 'active' as const,
				createdBy: 'system',
				createdAt: Date.now(),
			};

			await store.save(convoy);
			const loaded = await store.load('cv-abc12');

			expect(loaded).not.toBeNull();
			expect(loaded!.id).toBe('cv-abc12');
			expect(loaded!.name).toBe('Test Convoy');
		});
	});

	describe('delete()', () => {
		it('should delete a convoy', async () => {
			await store.init();

			const convoy = {
				id: 'cv-abc12',
				name: 'Test Convoy',
				beadIds: ['rd-bead1'],
				status: 'active' as const,
				createdBy: 'system',
				createdAt: Date.now(),
			};

			await store.save(convoy);
			await store.delete('cv-abc12');

			const loaded = await store.load('cv-abc12');
			expect(loaded).toBeNull();
		});

		it('should not throw when deleting non-existent file', async () => {
			await store.init();

			await expect(store.delete('cv-nonexistent')).resolves.not.toThrow();
		});
	});

	describe('listIds()', () => {
		it('should list all convoy IDs', async () => {
			await store.init();

			await store.save({
				id: 'cv-abc12',
				name: 'Convoy 1',
				beadIds: [],
				status: 'active',
				createdBy: 'system',
				createdAt: Date.now(),
			});
			await store.save({
				id: 'cv-def34',
				name: 'Convoy 2',
				beadIds: [],
				status: 'active',
				createdBy: 'system',
				createdAt: Date.now(),
			});

			const ids = await store.listIds();

			expect(ids.sort()).toEqual(['cv-abc12', 'cv-def34'].sort());
		});
	});

	describe('exists()', () => {
		it('should return true for existing convoy', async () => {
			await store.init();

			await store.save({
				id: 'cv-abc12',
				name: 'Test',
				beadIds: [],
				status: 'active',
				createdBy: 'system',
				createdAt: Date.now(),
			});

			const exists = await store.exists('cv-abc12');
			expect(exists).toBe(true);
		});

		it('should return false for non-existent convoy', async () => {
			await store.init();

			const exists = await store.exists('cv-nonexistent');
			expect(exists).toBe(false);
		});
	});
});