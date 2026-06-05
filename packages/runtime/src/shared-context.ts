/**
 * Shared Context System - Enables context propagation across agents
 * 
 * Provides functionality for:
 * - Context creation and management
 * - Context propagation to subagents
 * - Result capture and aggregation
 * - Context isolation between dispatches
 */

/**
 * Generate a unique ID
 */
function generateId(): string {
	return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Shared context entry for a single value
 */
export interface ContextEntry<T = unknown> {
	/** Unique identifier for this entry */
	id: string;
	/** The stored value */
	value: T;
	/** When this entry was created */
	createdAt: number;
	/** Who created this entry (agent ID) */
	createdBy?: string;
	/** Optional TTL in milliseconds */
	ttl?: number;
	/** Whether this entry is immutable */
	immutable?: boolean;
}

/**
 * Shared context for agent orchestration
 * 
 * Provides a centralized store for sharing data between agents
 * during orchestration workflows.
 */
export class SharedContext {
	private entries: Map<string, ContextEntry> = new Map();
	private parentContext?: SharedContext;
	private id: string;
	private metadata: Record<string, unknown> = {};

	constructor(parentContext?: SharedContext) {
		this.id = generateId();
		this.parentContext = parentContext;
	}

	/**
	 * Get the context ID
	 */
	getId(): string {
		return this.id;
	}

	/**
	 * Set a value in the context
	 * 
	 * @param key - Context key
	 * @param value - Value to store
	 * @param createdBy - Optional creator identifier
	 * @param options - Optional settings (ttl, immutable)
	 */
	set<T = unknown>(
		key: string,
		value: T,
		createdBy?: string,
		options?: { ttl?: number; immutable?: boolean }
	): void {
		// Check if immutable entry exists
		const existing = this.entries.get(key);
		if (existing?.immutable) {
			throw new Error(`Cannot modify immutable key: ${key}`);
		}

		const entry: ContextEntry<T> = {
			id: generateId(),
			value,
			createdAt: Date.now(),
			createdBy,
			ttl: options?.ttl,
			immutable: options?.immutable ?? false,
		};

		this.entries.set(key, entry);
	}

	/**
	 * Get a value from the context
	 * 
	 * @param key - Context key
	 * @returns The value or undefined if not found
	 */
	get<T = unknown>(key: string): T | undefined {
		const entry = this.getEntry(key);
		if (!entry) return undefined;

		// Check TTL
		if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
			this.entries.delete(key);
			return undefined;
		}

		return entry.value as T;
	}

	/**
	 * Check if a key exists in the context
	 * 
	 * @param key - Context key
	 * @returns True if key exists and is not expired
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Delete a key from the context
	 * 
	 * @param key - Context key
	 * @returns True if key was deleted
	 */
	delete(key: string): boolean {
		const entry = this.entries.get(key);
		if (entry?.immutable) {
			throw new Error(`Cannot delete immutable key: ${key}`);
		}
		return this.entries.delete(key);
	}

	/**
	 * Get entry with full metadata
	 */
	private getEntry(key: string): ContextEntry | undefined {
		// Check current context first
		if (this.entries.has(key)) {
			return this.entries.get(key);
		}

		// Fall back to parent context
		if (this.parentContext) {
			return this.parentContext.getEntry(key);
		}

		return undefined;
	}

	/**
	 * Get all keys in this context (not including parent)
	 */
	keys(): string[] {
		return Array.from(this.entries.keys());
	}

	/**
	 * Get all entries as a plain object
	 */
	toObject(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const [key, entry] of this.entries) {
			if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
				continue;
			}
			obj[key] = entry.value;
		}
		return obj;
	}

	/**
	 * Clear all entries (except immutable)
	 */
	clear(): void {
		for (const [key, entry] of this.entries) {
			if (!entry.immutable) {
				this.entries.delete(key);
			}
		}
	}

	/**
	 * Get context metadata
	 */
	getMetadata(): Record<string, unknown> {
		return { ...this.metadata };
	}

	/**
	 * Set context metadata
	 */
	setMetadata(key: string, value: unknown): void {
		this.metadata[key] = value;
	}

	/**
	 * Create a child context
	 */
	createChild(): SharedContext {
		return new SharedContext(this);
	}

	/**
	 * Fork the context - creates a new independent context with current values
	 */
	fork(): SharedContext {
		const forked = new SharedContext();
		for (const [key, entry] of this.entries) {
			forked.entries.set(key, { ...entry });
		}
		return forked;
	}

	/**
	 * Merge another context into this one
	 */
	merge(other: SharedContext, overwrite = true): void {
		const otherEntries = other.entries;
		for (const [key, entry] of otherEntries) {
			if (overwrite || !this.entries.has(key)) {
				const existing = this.entries.get(key);
				if (existing?.immutable) continue;
				this.entries.set(key, { ...entry });
			}
		}
	}

	/**
	 * Get the size of this context (excluding parent)
	 */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Check if context has expired entries and clean them up
	 */
	cleanup(): number {
		let cleaned = 0;
		const now = Date.now();
		for (const [key, entry] of this.entries) {
			if (entry.ttl && now - entry.createdAt > entry.ttl) {
				this.entries.delete(key);
				cleaned++;
			}
		}
		return cleaned;
	}
}

/**
 * Captured result from an agent execution
 */
export interface CapturedResult {
	/** Agent identifier */
	agentId: string;
	/** Timestamp when execution started */
	startTime: number;
	/** Timestamp when execution completed */
	endTime: number;
	/** Execution duration in milliseconds */
	duration: number;
	/** Whether execution was successful */
	success: boolean;
	/** Result data */
	data?: unknown;
	/** Error if unsuccessful */
	error?: string;
	/** Context snapshot at time of capture */
	contextSnapshot: Record<string, unknown>;
}

/**
 * Result capture utility for orchestrator workflows
 */
export class ResultCapture {
	private results: CapturedResult[] = [];

	/**
	 * Capture a result
	 */
	capture(result: Omit<CapturedResult, 'contextSnapshot'>): CapturedResult {
		const captured: CapturedResult = {
			...result,
			contextSnapshot: {},
		};
		this.results.push(captured);
		return captured;
	}

	/**
	 * Capture with context snapshot
	 */
	captureWithContext(
		result: Omit<CapturedResult, 'contextSnapshot'>,
		context: SharedContext
	): CapturedResult {
		const captured: CapturedResult = {
			...result,
			contextSnapshot: context.toObject(),
		};
		this.results.push(captured);
		return captured;
	}

	/**
	 * Get all captured results
	 */
	getResults(): CapturedResult[] {
		return [...this.results];
	}

	/**
	 * Get results for a specific agent
	 */
	getResultsForAgent(agentId: string): CapturedResult[] {
		return this.results.filter((r) => r.agentId === agentId);
	}

	/**
	 * Get the last captured result
	 */
	getLast(): CapturedResult | undefined {
		return this.results[this.results.length - 1];
	}

	/**
	 * Get successful results
	 */
	getSuccessful(): CapturedResult[] {
		return this.results.filter((r) => r.success);
	}

	/**
	 * Get failed results
	 */
	getFailed(): CapturedResult[] {
		return this.results.filter((r) => !r.success);
	}

	/**
	 * Aggregate all successful data
	 */
	aggregateData<T = unknown>(): T[] {
		return this.results
			.filter((r) => r.success && r.data !== undefined)
			.map((r) => r.data as T);
	}

	/**
	 * Clear all captured results
	 */
	clear(): void {
		this.results = [];
	}

	/**
	 * Get total execution time across all results
	 */
	getTotalDuration(): number {
		return this.results.reduce((sum, r) => sum + r.duration, 0);
	}

	/**
	 * Get the size of captured results
	 */
	get size(): number {
		return this.results.length;
	}
}

/**
 * Create a new shared context
 */
export function createSharedContext(parent?: SharedContext): SharedContext {
	return new SharedContext(parent);
}

/**
 * Create a new result capture
 */
export function createResultCapture(): ResultCapture {
	return new ResultCapture();
}

/**
 * Shared context factory for creating and managing contexts
 */
export class SharedContextFactory {
	private parentContext?: SharedContext;

	constructor(parentContext?: SharedContext) {
		this.parentContext = parentContext;
	}

	/**
	 * Create a new root context
	 */
	createRootContext(): SharedContext {
		return new SharedContext(this.parentContext);
	}

	/**
	 * Create a new child context
	 */
	createChildContext(): SharedContext {
		return new SharedContext();
	}
}

/**
 * Default context factory singleton
 */
export const defaultContextFactory = new SharedContextFactory();

/**
 * Propagation options for context sharing
 */
export interface PropagationOptions {
	/** Keys to include in propagation (empty = all) */
	include?: string[];
	/** Keys to exclude from propagation */
	exclude?: string[];
	/** Whether to include metadata */
	includeMetadata?: boolean;
	/** Whether to clone values or share references */
	cloneValues?: boolean;
}

/**
 * Result capture configuration
 */
export interface ResultCaptureConfig {
	/** Include context snapshot on capture */
	includeContextSnapshot?: boolean;
	/** Maximum number of results to store */
	maxResults?: number;
	/** Auto-cleanup expired entries */
	autoCleanup?: boolean;
	/** Cleanup interval in milliseconds */
	cleanupInterval?: number;
}

/**
 * Context trace for debugging/profiling
 */
export interface ContextTrace {
	/** Trace identifier */
	id: string;
	/** Operation performed */
	operation: 'set' | 'get' | 'delete' | 'clear' | 'merge' | 'fork' | 'createChild';
	/** Key affected */
	key: string;
	/** Timestamp */
	timestamp: number;
	/** Agent/source that performed the operation */
	source?: string;
	/** Whether operation succeeded */
	success: boolean;
	/** Error message if failed */
	error?: string;
}