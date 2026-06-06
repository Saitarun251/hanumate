/**
 * Convoy Manager - Main API for Convoy operations
 *
 * Provides a high-level interface for managing convoys including
 * create, read, update, delete, and bead management operations.
 */

import type {
	Convoy,
	ConvoyStatus,
	CreateConvoyOptions,
	UpdateConvoyOptions,
	ListConvoyOptions,
	ConvoyChangeEvent,
	ConvoyListener,
} from './convoy-types.js';
import { ConvoyStore, DEFAULT_CONVOYS_DIR } from './convoy-store.js';

/**
 * Characters used for ID generation
 */
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a unique convoy ID with format: cv-xxxxx
 */
function generateConvoyId(): string {
	const chars: string[] = [];
	for (let i = 0; i < 5; i++) {
		chars.push(ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length)));
	}
	return `cv-${chars.join('')}`;
}

/**
 * Convoy Manager - High-level API for convoy operations
 */
export class ConvoyManager {
	private readonly store: ConvoyStore;
	private readonly listeners: Set<ConvoyListener> = new Set();
	private initialized: boolean = false;

	constructor(basePath: string = DEFAULT_CONVOYS_DIR) {
		this.store = new ConvoyStore(basePath);
	}

	/**
	 * Initialize the manager and ensure storage is ready
	 */
	async init(): Promise<void> {
		if (this.initialized) return;
		await this.store.init();
		this.initialized = true;
	}

	/**
	 * Ensure manager is initialized
	 */
	private async ensureInit(): Promise<void> {
		if (!this.initialized) {
			await this.init();
		}
	}

	/**
	 * Notify all listeners of a change
	 */
	private notifyListeners(event: ConvoyChangeEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// Ignore listener errors
			}
		}
	}

	/**
	 * Subscribe to convoy changes
	 */
	onChange(listener: ConvoyListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Create a new convoy
	 *
	 * @param name - Human-readable name for the convoy
	 * @param beadIds - Initial bead IDs to include
	 * @param options - Additional options (notify, metadata)
	 * @param createdBy - Agent ID creating the convoy
	 */
	async create(
		name: string,
		beadIds: string[] = [],
		options?: CreateConvoyOptions,
		createdBy: string = 'system'
	): Promise<Convoy> {
		await this.ensureInit();

		const id = generateConvoyId();
		const now = Date.now();

		const convoy: Convoy = {
			id,
			name,
			beadIds: [...new Set([...beadIds, ...(options?.beadIds ?? [])])],
			status: 'active',
			createdBy,
			createdAt: now,
			notifyOnComplete: options?.notify,
			metadata: options?.metadata,
		};

		await this.store.save(convoy);
		this.notifyListeners({
			type: 'created',
			convoy,
			timestamp: now,
		});

		return convoy;
	}

	/**
	 * Get a convoy by ID
	 */
	async get(convoyId: string): Promise<Convoy | null> {
		await this.ensureInit();
		return this.store.load(convoyId);
	}

	/**
	 * Update a convoy's properties
	 */
	async update(convoyId: string, updates: UpdateConvoyOptions): Promise<Convoy | null> {
		await this.ensureInit();

		const convoy = await this.store.load(convoyId);
		if (!convoy) {
			return null;
		}

		const updatedConvoy: Convoy = {
			...convoy,
			...updates,
			completedAt:
				updates.status === 'completed' || updates.status === 'landed'
					? Date.now()
					: convoy.completedAt,
		};

		await this.store.save(updatedConvoy);
		this.notifyListeners({
			type: 'updated',
			convoy: updatedConvoy,
			timestamp: Date.now(),
		});

		return updatedConvoy;
	}

	/**
	 * Delete a convoy
	 */
	async delete(convoyId: string): Promise<boolean> {
		await this.ensureInit();

		const exists = await this.store.exists(convoyId);
		if (!exists) {
			return false;
		}

		const convoy = await this.store.load(convoyId);
		await this.store.delete(convoyId);

		if (convoy) {
			this.notifyListeners({
				type: 'deleted',
				convoy,
				timestamp: Date.now(),
			});
		}

		return true;
	}

	/**
	 * Add beads to a convoy
	 */
	async addBeads(convoyId: string, beadIds: string[]): Promise<Convoy | null> {
		await this.ensureInit();

		const convoy = await this.store.load(convoyId);
		if (!convoy) {
			return null;
		}

		const newBeadIds = [...new Set([...convoy.beadIds, ...beadIds])];
		const updatedConvoy: Convoy = {
			...convoy,
			beadIds: newBeadIds,
		};

		await this.store.save(updatedConvoy);
		this.notifyListeners({
			type: 'bead_added',
			convoy: updatedConvoy,
			timestamp: Date.now(),
		});

		return updatedConvoy;
	}

	/**
	 * Remove beads from a convoy
	 */
	async removeBeads(convoyId: string, beadIds: string[]): Promise<Convoy | null> {
		await this.ensureInit();

		const convoy = await this.store.load(convoyId);
		if (!convoy) {
			return null;
		}

		const beadIdSet = new Set(beadIds);
		const newBeadIds = convoy.beadIds.filter((id) => !beadIdSet.has(id));
		const updatedConvoy: Convoy = {
			...convoy,
			beadIds: newBeadIds,
		};

		await this.store.save(updatedConvoy);
		this.notifyListeners({
			type: 'bead_removed',
			convoy: updatedConvoy,
			timestamp: Date.now(),
		});

		return updatedConvoy;
	}

	/**
	 * Land a convoy (mark as landed)
	 */
	async land(convoyId: string): Promise<Convoy | null> {
		return this.update(convoyId, { status: 'landed' });
	}

	/**
	 * Complete a convoy (mark as completed)
	 */
	async complete(convoyId: string): Promise<Convoy | null> {
		return this.update(convoyId, { status: 'completed' });
	}

	/**
	 * List convoys with optional filtering
	 */
	async list(options?: ListConvoyOptions): Promise<Convoy[]> {
		await this.ensureInit();

		let convoys = await this.store.loadAll();

		// Apply filters
		if (options?.status) {
			convoys = convoys.filter((c) => c.status === options.status);
		}

		if (options?.createdBy) {
			convoys = convoys.filter((c) => c.createdBy === options.createdBy);
		}

		if (options?.beadId) {
			convoys = convoys.filter((c) => c.beadIds.includes(options.beadId!));
		}

		// Sort by createdAt descending (newest first)
		convoys.sort((a, b) => b.createdAt - a.createdAt);

		return convoys;
	}

	/**
	 * Get all active convoys
	 */
	async getActive(): Promise<Convoy[]> {
		return this.list({ status: 'active' });
	}

	/**
	 * Get convoys containing a specific bead
	 */
	async getByBead(beadId: string): Promise<Convoy[]> {
		return this.list({ beadId });
	}

	/**
	 * Get the storage path for this manager
	 */
	getStoragePath(): string {
		return this.store.getStoragePath();
	}
}

/**
 * Create a new ConvoyManager instance
 */
export function createConvoyManager(basePath?: string): ConvoyManager {
	return new ConvoyManager(basePath);
}