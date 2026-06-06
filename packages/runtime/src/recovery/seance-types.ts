/**
 * Seance Types - Session Discovery and Recovery
 * 
 * Enables agents to discover and recover context from previous sessions.
 */

/**
 * Session ID format: session-xxxxx
 */
export type SessionId = string;

/**
 * Session event types
 */
export type SessionEventType = 'start' | 'prompt' | 'tool' | 'complete' | 'error' | 'checkpoint';

/**
 * Session event
 */
export interface SessionEvent {
	/** Event type */
	type: SessionEventType;
	
	/** When it occurred */
	timestamp: number;
	
	/** Event data */
	data: unknown;
	
	/** Optional sequence number */
	sequence?: number;
}

/**
 * Session record
 */
export interface SessionRecord {
	/** Unique identifier */
	id: SessionId;
	
	/** Agent ID that ran this session */
	agentId: string;
	
	/** When the session started */
	startedAt: number;
	
	/** When the session ended (if ended) */
	endedAt?: number;
	
	/** Beads worked on */
	workBeads: string[];
	
	/** Session events */
	events: SessionEvent[];
	
	/** Final status */
	status: 'active' | 'completed' | 'failed' | 'abandoned';
	
	/** Last event timestamp */
	lastEventAt: number;
	
	/** Metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Query options for session discovery
 */
export interface SessionQuery {
	/** Filter by agent ID */
	agentId?: string;
	
	/** Filter by status */
	status?: SessionRecord['status'];
	
	/** Filter by bead */
	beadId?: string;
	
	/** Start of time range */
	startTime?: number;
	
	/** End of time range */
	endTime?: number;
	
	/** Maximum results */
	limit?: number;
	
	/** Sort order */
	sort?: 'asc' | 'desc';
}

/**
 * Seance options
 */
export interface SeanceOptions {
	/** Storage directory */
	storageDir?: string;
	
	/** Maximum events per session */
	maxEventsPerSession?: number;
	
	/** Session retention days */
	retentionDays?: number;
	
	/** Checkpoint interval */
	checkpointIntervalMs?: number;
}

/**
 * Question to predecessor
 */
export interface PredecessorQuestion {
	/** Session to query */
	sessionId: string;
	
	/** Question to ask */
	question: string;
	
	/** Timestamp */
	timestamp: number;
}

/**
 * Answer from predecessor
 */
export interface PredecessorAnswer {
	/** Session that answered */
	sessionId: string;
	
	/** Answer text */
	answer: string;
	
	/** Timestamp */
	timestamp: number;
	
	/** Events used to generate answer */
	eventsUsed: number;
}

/**
 * Generate a session ID
 */
export function generateSessionId(): SessionId {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'session-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Create a new session record
 */
export function createSessionRecord(
	agentId: string,
	options?: {
		workBeads?: string[];
		metadata?: Record<string, unknown>;
	}
): SessionRecord {
	const now = Date.now();
	return {
		id: generateSessionId(),
		agentId,
		startedAt: now,
		workBeads: options?.workBeads ?? [],
		events: [],
		status: 'active',
		lastEventAt: now,
		metadata: options?.metadata,
	};
}

/**
 * Create a session event
 */
export function createSessionEvent(
	type: SessionEventType,
	data: unknown,
	options?: {
		sequence?: number;
	}
): SessionEvent {
	return {
		type,
		timestamp: Date.now(),
		data,
		sequence: options?.sequence,
	};
}

/**
 * Get session duration in ms
 */
export function getSessionDuration(session: SessionRecord): number {
	const endTime = session.endedAt ?? Date.now();
	return endTime - session.startedAt;
}

/**
 * Check if session is stale (no events for X ms)
 */
export function isSessionStale(session: SessionRecord, thresholdMs: number): boolean {
	return (Date.now() - session.lastEventAt) > thresholdMs;
}