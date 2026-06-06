/**
 * Nudge Types - Real-time agent wake-up via WebSocket
 *
 * Nudge provides instant agent activation through WebSocket connections.
 * It supports wake-up signals, work dispatch, interrupts, and heartbeat monitoring.
 */

/**
 * Nudge message types representing different wake-up scenarios
 */
export type NudgeType = 'wake' | 'work' | 'interrupt' | 'heartbeat';

/**
 * A nudge message between agents via WebSocket
 *
 * Nudge messages are ephemeral real-time signals sent over WebSocket
 * to wake up agents or dispatch work without persistent storage.
 */
export interface NudgeMessage {
	/** Unique message ID (format: nudge-xxxxx) */
	id: string;
	/** Sender agent ID */
	from: string;
	/** Recipient agent ID */
	to: string;
	/** Type of nudge message */
	type: NudgeType;
	/** Message payload containing nudge data */
	payload: NudgePayload;
	/** Creation timestamp */
	createdAt: number;
}

/**
 * Payload content for nudge messages
 *
 * The payload structure varies based on nudge type:
 * - wake: General agent activation
 * - work: Work dispatch with task details
 * - interrupt: Urgent interruption with reason
 * - heartbeat: Keep-alive ping
 */
export interface NudgePayload {
	/** Task description for work nudges */
	task?: string;
	/** Task priority level (higher = more urgent) */
	priority?: number;
	/** Reason for interrupt nudges */
	reason?: string;
	/** Optional metadata for additional context */
	metadata?: Record<string, unknown>;
}

/**
 * Nudge configuration for server setup
 */
export interface NudgeConfig {
	/** WebSocket server port */
	port?: number;
	/** WebSocket server host */
	host?: string;
	/** Path for WebSocket endpoint */
	path?: string;
	/** Heartbeat interval in milliseconds */
	heartbeatInterval?: number;
	/** Connection timeout in milliseconds */
	connectionTimeout?: number;
	/** Maximum reconnection attempts */
	maxReconnectAttempts?: number;
	/** Agent ID for this client (for filtering) */
	agentId?: string;
}

/**
 * Callback interface for handling incoming nudge messages
 */
export interface NudgeHandler {
	/**
	 * Handle an incoming nudge message
	 * @param message - The nudge message received
	 */
	onNudge(message: NudgeMessage): void | Promise<void>;

	/**
	 * Handle connection established event
	 * @param connection - The established connection
	 */
	onConnect?(connection: NudgeConnection): void | Promise<void>;

	/**
	 * Handle disconnection event
	 * @param connection - The disconnected connection
	 */
	onDisconnect?(connection: NudgeConnection): void | Promise<void>;

	/**
	 * Handle connection error
	 * @param error - The error that occurred
	 */
	onError?(error: Error): void | Promise<void>;
}

/**
 * Client connection interface for WebSocket connections
 */
export interface NudgeConnection {
	/** Unique connection ID */
	id: string;
	/** Agent ID associated with this connection */
	agentId: string;
	/** Whether the connection is currently active */
	active: boolean;
	/** Timestamp when connection was established */
	connectedAt: number;
	/** Timestamp of last heartbeat received */
	lastHeartbeat?: number;
	/** Optional metadata for the connection */
	metadata?: Record<string, unknown>;

	/**
	 * Send a nudge message through this connection
	 * @param message - The message to send
	 */
	send(message: NudgeMessage): Promise<void>;

	/**
	 * Close the connection
	 */
	close(): Promise<void>;
}

/**
 * Nudge filter options for querying messages
 */
export interface NudgeFilter {
	/** Filter by recipient */
	to?: string;
	/** Filter by sender */
	from?: string;
	/** Filter by nudge type */
	type?: NudgeType;
	/** Filter by time range (start) */
	since?: number;
	/** Filter by time range (end) */
	until?: number;
}

/**
 * Connection state for tracking active connections
 */
export interface NudgeConnectionState {
	/** All active connections */
	connections: Map<string, NudgeConnection>;
	/** Connection count by agent ID */
	byAgent: Map<string, NudgeConnection[]>;
}

/**
 * Generate a unique nudge ID
 */
export function generateNudgeId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'nudge-';
	for (let i = 0; i < 5; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * Validate a nudge ID format
 */
export function isValidNudgeId(id: string): boolean {
	return /^nudge-[a-z0-9]{5}$/.test(id);
}

/**
 * Create a new nudge message
 */
export function createNudge(
	options: CreateNudgeOptions
): NudgeMessage {
	return {
		id: options.id ?? generateNudgeId(),
		from: options.from,
		to: options.to,
		type: options.type,
		payload: options.payload ?? {},
		createdAt: options.createdAt ?? Date.now(),
	};
}

/**
 * Options for creating a nudge message
 */
export interface CreateNudgeOptions {
	/** Unique message ID (optional, auto-generated if not provided) */
	id?: string;
	/** Sender agent ID */
	from: string;
	/** Recipient agent ID */
	to: string;
	/** Type of nudge message */
	type: NudgeType;
	/** Message payload (optional) */
	payload?: NudgePayload;
	/** Creation timestamp (optional, defaults to now) */
	createdAt?: number;
}