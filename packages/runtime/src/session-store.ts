/**
 * Session Store - Persistence layer for agent sessions
 * 
 * Provides interfaces and implementations for storing session data across
 * different runtime environments (Node.js, Cloudflare Workers, etc.)
 */

// Local type definitions for Turn (matching pi-agent-core interface)
interface Turn {
	type: 'user' | 'assistant' | 'system';
	content: string;
	attachments?: Array<{
		name: string;
		type: string;
		url?: string;
	}>;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Message in a session conversation
 */
export interface SessionMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	attachments?: Array<{
		name: string;
		type: string;
		url?: string;
	}>;
	metadata?: Record<string, unknown>;
}

/**
 * Complete session data stored by the session store
 */
export interface SessionData {
	id: string;
	messages: SessionMessage[];
	createdAt: number;
	updatedAt: number;
	expiresAt: number | null;
	metadata: SessionMetadata;
}

/**
 * Metadata associated with a session
 */
export interface SessionMetadata {
	model?: string;
	skills?: string[];
	env?: Record<string, string>;
	userId?: string;
	agentId?: string;
	tags?: string[];
}

/**
 * Session store interface - must be implemented by all backends
 */
export interface SessionStore {
	/**
	 * Save session data
	 * @param id - Session ID
	 * @param data - Session data to save
	 */
	save(id: string, data: SessionData): Promise<void>;

	/**
	 * Load session data by ID
	 * @param id - Session ID
	 * @returns Session data or null if not found/expired
	 */
	load(id: string): Promise<SessionData | null>;

	/**
	 * Delete a session
	 * @param id - Session ID
	 */
	delete(id: string): Promise<void>;

	/**
	 * List all session IDs
	 * @returns Array of session IDs
	 */
	list(): Promise<string[]>;

	/**
	 * Check if a session exists and is valid
	 * @param id - Session ID
	 */
	exists(id: string): Promise<boolean>;
}

/**
 * Session store configuration
 */
export interface SessionStoreConfig {
	/** Default TTL in milliseconds (null = no expiration) */
	defaultTTL?: number | null;
	/** Enable automatic expiration cleanup */
	autoCleanup?: boolean;
	/** Cleanup interval in milliseconds (default: 60000) */
	cleanupInterval?: number;
}

// ============================================================================
// In-Memory Session Store (Node.js)
// ============================================================================

interface SessionEntry {
	data: SessionData;
	timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * In-memory session store for Node.js environments
 * 
 * Uses Map for storage with optional TTL support
 */
export class InMemorySessionStore implements SessionStore {
	private sessions: Map<string, SessionEntry> = new Map();
	private readonly defaultTTL: number | null;
	private cleanupTimer?: ReturnType<typeof setInterval>;
	private readonly autoCleanup: boolean;

	constructor(config?: SessionStoreConfig) {
		this.defaultTTL = config?.defaultTTL ?? 24 * 60 * 60 * 1000; // 24 hours default
		this.autoCleanup = config?.autoCleanup ?? true;

		if (this.autoCleanup) {
			const interval = config?.cleanupInterval ?? 60000;
			this.startCleanupTimer(interval);
		}
	}

	/**
	 * Start the automatic cleanup timer for expired sessions
	 */
	private startCleanupTimer(intervalMs: number): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, intervalMs);
	}

	/**
	 * Stop the cleanup timer
	 */
	stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
		// Clear all session timeouts
		for (const entry of this.sessions.values()) {
			if (entry.timeoutId) {
				clearTimeout(entry.timeoutId);
			}
		}
	}

	/**
	 * Clean up expired sessions
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [id, entry] of this.sessions.entries()) {
			if (entry.data.expiresAt && entry.data.expiresAt < now) {
				this.sessions.delete(id);
			}
		}
	}

	/**
	 * Set up TTL timeout for a session
	 */
	private setTTL(id: string, entry: SessionEntry, ttl: number): void {
		if (entry.timeoutId) {
			clearTimeout(entry.timeoutId);
		}
		entry.timeoutId = setTimeout(() => {
			this.sessions.delete(id);
		}, ttl);
	}

	async save(id: string, data: SessionData): Promise<void> {
		// Update timestamps
		const now = Date.now();
		const updatedData: SessionData = {
			...data,
			updatedAt: now,
		};

		// Calculate expiration if TTL is set
		if (updatedData.expiresAt === null && this.defaultTTL !== null) {
			updatedData.expiresAt = now + this.defaultTTL;
		}

		const existingEntry = this.sessions.get(id);
		if (existingEntry?.timeoutId) {
			clearTimeout(existingEntry.timeoutId);
		}

		const entry: SessionEntry = { data: updatedData };

		// Set up TTL timeout
		if (updatedData.expiresAt) {
			const ttl = updatedData.expiresAt - now;
			this.setTTL(id, entry, ttl);
		}

		this.sessions.set(id, entry);
	}

	async load(id: string): Promise<SessionData | null> {
		const entry = this.sessions.get(id);
		if (!entry) {
			return null;
		}

		// Check expiration
		if (entry.data.expiresAt && entry.data.expiresAt < Date.now()) {
			this.sessions.delete(id);
			return null;
		}

		return entry.data;
	}

	async delete(id: string): Promise<void> {
		const entry = this.sessions.get(id);
		if (entry?.timeoutId) {
			clearTimeout(entry.timeoutId);
		}
		this.sessions.delete(id);
	}

	async list(): Promise<string[]> {
		const now = Date.now();
		const validIds: string[] = [];

		for (const [id, entry] of this.sessions.entries()) {
			if (!entry.data.expiresAt || entry.data.expiresAt >= now) {
				validIds.push(id);
			}
		}

		return validIds;
	}

	async exists(id: string): Promise<boolean> {
		const entry = this.sessions.get(id);
		if (!entry) {
			return false;
		}
		// Check expiration
		if (entry.data.expiresAt && entry.data.expiresAt < Date.now()) {
			this.sessions.delete(id);
			return false;
		}
		return true;
	}
}

// ============================================================================
// Cloudflare Durable Objects Session Store
// ============================================================================

/**
 * Cloudflare Durable Objects session store implementation
 * 
 * Note: This requires Cloudflare Workers environment.
 * Import from 'session-store-cf.ts' in your Worker bundle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const DurableObjectStorage: any;

export class DurableObjectSessionStore implements SessionStore {
	// Cloudflare Durable Objects storage interface
	private readonly storage: {
		get<T>(id: string): Promise<T | null>;
		put(id: string, data: unknown): Promise<void>;
		delete(id: string): Promise<void>;
		list<T>(): Promise<{ keys(): { forEach(fn: (key: string) => void): void } }>;
	};

	constructor(storage: DurableObjectSessionStore['storage']) {
		this.storage = storage;
	}

	async save(id: string, data: SessionData): Promise<void> {
		// Store with automatic expiration using Durable Objects expiry
		const expiryMs = data.expiresAt ? data.expiresAt - Date.now() : undefined;

		if (expiryMs && expiryMs > 0) {
			// Set with automatic expiration
			await this.storage.put(id, data);
		} else {
			await this.storage.put(id, data);
		}
	}

	async load(id: string): Promise<SessionData | null> {
		const data = await this.storage.get<SessionData>(id);
		return data ?? null;
	}

	async delete(id: string): Promise<void> {
		await this.storage.delete(id);
	}

	async list(): Promise<string[]> {
		const keys = await this.storage.list<SessionData>();
		const result: string[] = [];
		keys.keys().forEach((key: string) => result.push(key));
		return result;
	}

	async exists(id: string): Promise<boolean> {
		const value = await this.storage.get(id);
		return value !== null;
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
	return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create session data from messages and metadata
 */
export function createSessionData(
	id: string,
	messages: SessionMessage[],
	metadata?: Partial<SessionMetadata>,
	ttlMs?: number | null
): SessionData {
	const now = Date.now();
	return {
		id,
		messages,
		createdAt: now,
		updatedAt: now,
		expiresAt: ttlMs !== undefined ? (ttlMs !== null ? now + ttlMs : null) : null,
		metadata: {
			...(metadata ?? {}),
		},
	};
}

/**
 * Convert pi-agent-core Turn to SessionMessage
 */
export function turnToMessage(turn: Turn): SessionMessage {
	return {
		id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
		role: turn.type === 'user' ? 'user' : turn.type === 'assistant' ? 'assistant' : 'system',
		content: turn.content,
		timestamp: Date.now(),
		attachments: turn.attachments?.map((att: { name: string; type: string; url?: string }) => ({
			name: att.name,
			type: att.type,
			url: att.url,
		})),
	};
}

/**
 * Convert SessionMessage to pi-agent-core Turn format
 */
export function messageToTurn(message: SessionMessage): Turn {
	return {
		type: message.role as 'user' | 'assistant' | 'system',
		content: message.content,
		attachments: message.attachments?.map((att) => ({
			name: att.name,
			type: att.type,
			url: att.url,
		})) ?? [],
	};
}