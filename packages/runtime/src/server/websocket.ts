/**
 * WebSocket Handler - Real-time agent communication via WebSocket
 *
 * Provides WebSocket-based real-time communication for agents with support
 * for streaming responses, session reconnection, and session store integration.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { SessionStore, SessionData, SessionMessage } from '../session-store.js';
import { generateSessionId } from '../session-store.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * WebSocket message types for agent communication
 */
export type WebSocketMessageType =
	| 'auth'
	| 'auth_ack'
	| 'prompt'
	| 'response'
	| 'stream_start'
	| 'stream_chunk'
	| 'stream_end'
	| 'error'
	| 'heartbeat'
	| 'heartbeat_ack'
	| 'session_state'
	| 'reconnect';

/**
 * Incoming WebSocket message from client
 */
export interface WebSocketIncomingMessage {
	type: WebSocketMessageType;
	sessionId?: string;
	prompt?: string;
	content?: string;
	chunk?: string;
	agentId?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Outgoing WebSocket message to client
 */
export interface WebSocketOutgoingMessage {
	type: WebSocketMessageType;
	sessionId?: string;
	content?: string;
	chunk?: string;
	done?: boolean;
	error?: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

/**
 * Configuration for WebSocket handler
 */
export interface WebSocketHandlerConfig {
	/** Session store for session persistence (optional) */
	sessionStore?: SessionStore;
	/** Heartbeat interval in milliseconds (default: 30000) */
	heartbeatInterval?: number;
	/** Connection timeout in milliseconds (default: 60000) */
	connectionTimeout?: number;
	/** Maximum message size in bytes (default: 10MB) */
	maxMessageSize?: number;
	/** Enable session persistence (default: true) */
	enableSessionPersistence?: boolean;
}

/**
 * Active WebSocket connection info
 */
interface WebSocketConnectionInfo {
	connectionId: string;
	agentId: string;
	sessionId?: string;
	socket: WebSocket;
	connectedAt: number;
	lastHeartbeat: number;
	isAuthenticated: boolean;
}

/**
 * Session state for reconnection support
 */
interface SessionState {
	sessionId: string;
	messages: SessionMessage[];
	lastActivity: number;
	pendingResponse?: string;
}

/**
 * Event handler types for WebSocket events
 */
export interface WebSocketEventHandlers {
	/** Handle incoming prompt from client */
	onPrompt?: (agentId: string, sessionId: string, prompt: string, connectionId: string) => void | Promise<void>;
	/** Handle client authentication */
	onAuth?: (agentId: string, credentials: Record<string, unknown>) => boolean | Promise<boolean>;
	/** Handle streaming chunk request */
	onStreamChunk?: (agentId: string, sessionId: string, chunk: string) => void | Promise<void>;
	/** Handle stream end */
	onStreamEnd?: (agentId: string, sessionId: string) => void | Promise<void>;
	/** Handle connection event */
	onConnect?: (agentId: string, connectionId: string) => void;
	/** Handle disconnection event */
	onDisconnect?: (agentId: string, connectionId: string, reason: string) => void;
	/** Handle error */
	onError?: (agentId: string, connectionId: string, error: Error) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const DEFAULT_CONNECTION_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SESSION_RECONNECT_WINDOW = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// WebSocket Handler Class
// ============================================================================

/**
 * WebSocketHandler - Manages WebSocket connections for real-time agent communication
 *
 * Provides:
 * - Agent authentication and connection management
 * - Streaming response support via chunked messages
 * - Session reconnection handling
 * - Session store integration for persistence
 * - Heartbeat monitoring
 */
export class WebSocketHandler {
	private wss: WebSocketServer | null = null;
	private connections: Map<string, WebSocketConnectionInfo> = new Map();
	private agentConnections: Map<string, Set<string>> = new Map();
	private sessionStates: Map<string, SessionState> = new Map();
	private config: {
		heartbeatInterval: number;
		connectionTimeout: number;
		maxMessageSize: number;
		enableSessionPersistence: boolean;
		sessionStore?: SessionStore;
	};
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private eventHandlers: WebSocketEventHandlers = {};
	private isRunning: boolean = false;
	private connectionIdCounter: number = 0;

	/**
	 * Create a new WebSocketHandler instance
	 * @param config - Optional handler configuration
	 */
	constructor(config?: WebSocketHandlerConfig) {
		this.config = {
			heartbeatInterval: config?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
			connectionTimeout: config?.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
			maxMessageSize: config?.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE,
			enableSessionPersistence: config?.enableSessionPersistence ?? true,
			sessionStore: config?.sessionStore,
		};
	}

	/**
	 * Set event handlers for WebSocket events
	 * @param handlers - Event handler callbacks
	 */
	setEventHandlers(handlers: WebSocketEventHandlers): void {
		this.eventHandlers = { ...this.eventHandlers, ...handlers };
	}

	/**
	 * Start the WebSocket server
	 * @param server - Optional HTTP server to attach to
	 * @param path - WebSocket path (default: '/ws')
	 */
	async start(server?: import('http').Server, path = '/ws'): Promise<void> {
		if (this.isRunning) {
			throw new Error('WebSocketHandler is already running');
		}

		if (server) {
			// Attach to existing HTTP server
			this.wss = new WebSocketServer({ noServer: true });

			server.on('upgrade', (request: IncomingMessage, socket, head) => {
				const url = request.url ?? '';
				const basePath = path.endsWith('/') ? path.slice(0, -1) : path;

				// Check if path matches
				if (url === basePath || url.startsWith(basePath + '/')) {
					this.handleUpgrade(request, socket, head);
				}
			});
		} else {
			// Create standalone WebSocket server
			this.wss = new WebSocketServer({ noServer: true });
		}

		this.setupEventHandlers();
		this.startHeartbeat();
		this.isRunning = true;
	}

	/**
	 * Stop the WebSocket server
	 * @param timeoutMs - Shutdown timeout in milliseconds
	 */
	async stop(timeoutMs = 5000): Promise<void> {
		if (!this.isRunning || !this.wss) {
			return;
		}

		this.stopHeartbeat();

		// Close all client connections gracefully
		const closePromises: Promise<void>[] = [];
		for (const [connectionId, info] of this.connections) {
			closePromises.push(this.closeConnection(connectionId, 1000, 'Server shutdown'));
		}

		// Wait for all connections to close
		await Promise.race([
			Promise.all(closePromises),
			new Promise(resolve => setTimeout(resolve, timeoutMs)),
		]);

		// Clear maps
		this.connections.clear();
		this.agentConnections.clear();

		// Close server
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.isRunning = false;
				this.wss = null;
				resolve();
			}, timeoutMs);

			this.wss!.close((err?: Error) => {
				clearTimeout(timeout);
				if (err) {
					reject(err);
				} else {
					this.wss = null;
					this.isRunning = false;
					resolve();
				}
			});
		});
	}

	/**
	 * Handle HTTP upgrade request
	 */
	private handleUpgrade(
		request: IncomingMessage,
		socket: import('stream').Duplex,
		head: Buffer
	): void {
		if (!this.wss) return;

		const url = new URL(request.url ?? '/', 'http://localhost');
		const sessionId = url.searchParams.get('sessionId');
		const agentId = url.searchParams.get('agentId') ?? 'unknown';

		// Create temporary connection ID
		const connectionId = this.generateConnectionId();

		// Create WebSocket server for this connection
		const wss = new WebSocketServer({ noServer: true });

		wss.on('connection', (ws: WebSocket) => {
			this.handleConnection(ws, request, connectionId, agentId, sessionId ?? undefined);
		});

		// Cast Duplex to net.Socket for handleUpgrade
		const netSocket = socket as unknown as import('net').Socket;
		wss.handleUpgrade(request, netSocket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	}

	/**
	 * Handle a new WebSocket connection
	 */
	private handleConnection(
		socket: WebSocket,
		request: IncomingMessage,
		connectionId: string,
		agentId: string,
		sessionId?: string
	): void {
		const info: WebSocketConnectionInfo = {
			connectionId,
			agentId,
			sessionId,
			socket,
			connectedAt: Date.now(),
			lastHeartbeat: Date.now(),
			isAuthenticated: false,
		};

		this.connections.set(connectionId, info);

		// Register agent connection
		if (!this.agentConnections.has(agentId)) {
			this.agentConnections.set(agentId, new Set());
		}
		this.agentConnections.get(agentId)!.add(connectionId);

		// Handle messages
		socket.addEventListener('message', (event) => {
			this.handleMessage(connectionId, event.data);
		});

		// Handle close
		socket.addEventListener('close', (event) => {
			this.handleClose(connectionId, event.code, event.reason);
		});

		// Handle errors
		socket.addEventListener('error', (event) => {
			const errorEvent = event as unknown as { error?: Error };
			this.handleError(connectionId, errorEvent.error ?? new Error('WebSocket error'));
		});

		// Send welcome message
		this.send(connectionId, {
			type: 'auth',
			timestamp: Date.now(),
			metadata: {
				connectionId,
				requiresAuth: true,
			},
		});
	}

	/**
	 * Handle incoming WebSocket message
	 */
	private handleMessage(connectionId: string, data: unknown): void {
		const info = this.connections.get(connectionId);
		if (!info) return;

		// Parse message
		let message: WebSocketIncomingMessage;
		try {
			if (typeof data === 'object' && data !== null && Buffer.isBuffer(data)) {
				data = (data as Buffer).toString('utf-8');
			}
			if (typeof data !== 'string') {
				throw new Error('Invalid message format');
			}
			message = JSON.parse(data);
		} catch (err) {
			this.sendError(connectionId, 'Invalid JSON message');
			return;
		}

		// Update heartbeat
		info.lastHeartbeat = Date.now();

		// Handle message by type
		switch (message.type) {
			case 'auth':
				this.handleAuth(connectionId, message);
				break;

			case 'prompt':
				this.handlePrompt(connectionId, message);
				break;

			case 'stream_chunk':
				this.handleStreamChunk(connectionId, message);
				break;

			case 'stream_end':
				this.handleStreamEnd(connectionId, message);
				break;

			case 'heartbeat':
				this.handleHeartbeat(connectionId);
				break;

			case 'reconnect':
				this.handleReconnect(connectionId, message);
				break;

			default:
				this.sendError(connectionId, `Unknown message type: ${message.type}`);
		}
	}

	/**
	 * Handle authentication message
	 */
	private async handleAuth(connectionId: string, message: WebSocketIncomingMessage): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info) return;

		const agentId = message.agentId ?? info.agentId;

		// Call auth handler if provided
		let authenticated = true;
		if (this.eventHandlers.onAuth) {
			try {
				authenticated = await this.eventHandlers.onAuth(
					agentId,
					message.metadata ?? {}
				);
			} catch {
				authenticated = false;
			}
		}

		if (!authenticated) {
			this.sendError(connectionId, 'Authentication failed');
			this.closeConnection(connectionId, 1008, 'Authentication failed');
			return;
		}

		// Update connection info
		info.agentId = agentId;
		info.isAuthenticated = true;

		// Send auth acknowledgment
		this.send(connectionId, {
			type: 'auth_ack',
			timestamp: Date.now(),
			metadata: {
				agentId,
				connectionId,
			},
		});

		// Call connect handler
		if (this.eventHandlers.onConnect) {
			this.eventHandlers.onConnect(agentId, connectionId);
		}
	}

	/**
	 * Handle prompt message
	 */
	private async handlePrompt(connectionId: string, message: WebSocketIncomingMessage): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info || !info.isAuthenticated) {
			this.sendError(connectionId, 'Not authenticated');
			return;
		}

		if (!message.prompt) {
			this.sendError(connectionId, 'Missing prompt content');
			return;
		}

		// Get or create session ID
		let sessionId = message.sessionId ?? info.sessionId ?? generateSessionId();
		info.sessionId = sessionId;

		// Store session state
		this.updateSessionState(sessionId, {
			sessionId,
			messages: [],
			lastActivity: Date.now(),
		});

		// Persist user message to session store if enabled
		if (this.config.enableSessionPersistence && this.config.sessionStore) {
			await this.addMessageToSession(sessionId, {
				id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
				role: 'user',
				content: message.prompt,
				timestamp: Date.now(),
			});
		}

		// Notify about stream start
		this.send(connectionId, {
			type: 'stream_start',
			sessionId,
			timestamp: Date.now(),
		});

		// Call prompt handler
		if (this.eventHandlers.onPrompt) {
			try {
				await this.eventHandlers.onPrompt(info.agentId, sessionId, message.prompt, connectionId);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				this.sendError(connectionId, `Prompt processing failed: ${error.message}`);
			}
		}
	}

	/**
	 * Handle stream chunk message
	 */
	private async handleStreamChunk(connectionId: string, message: WebSocketIncomingMessage): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info || !info.isAuthenticated) {
			this.sendError(connectionId, 'Not authenticated');
			return;
		}

		if (!message.chunk && !message.content) {
			this.sendError(connectionId, 'Missing chunk content');
			return;
		}

		const chunk = message.chunk ?? message.content ?? '';

		// Update session state with chunk
		const sessionId = message.sessionId ?? info.sessionId;
		if (sessionId) {
			const state = this.sessionStates.get(sessionId);
			if (state) {
				state.pendingResponse = (state.pendingResponse ?? '') + chunk;
				state.lastActivity = Date.now();
			}
		}

		// Call stream chunk handler
		if (this.eventHandlers.onStreamChunk && sessionId) {
			try {
				await this.eventHandlers.onStreamChunk(info.agentId, sessionId, chunk);
			} catch {
				// Ignore handler errors for chunks
			}
		}
	}

	/**
	 * Handle stream end message
	 */
	private async handleStreamEnd(connectionId: string, message: WebSocketIncomingMessage): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info || !info.isAuthenticated) {
			this.sendError(connectionId, 'Not authenticated');
			return;
		}

		const sessionId = message.sessionId ?? info.sessionId;
		if (!sessionId) {
			this.sendError(connectionId, 'No session ID');
			return;
		}

		// Get final content
		const state = this.sessionStates.get(sessionId);
		const finalContent = state?.pendingResponse ?? '';

		// Persist assistant message to session store
		if (this.config.enableSessionPersistence && this.config.sessionStore) {
			await this.addMessageToSession(sessionId, {
				id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
				role: 'assistant',
				content: finalContent,
				timestamp: Date.now(),
			});
		}

		// Clear pending response
		if (state) {
			state.pendingResponse = undefined;
		}

		// Notify stream end
		this.send(connectionId, {
			type: 'stream_end',
			sessionId,
			content: finalContent,
			done: true,
			timestamp: Date.now(),
		});

		// Call stream end handler
		if (this.eventHandlers.onStreamEnd && sessionId) {
			try {
				await this.eventHandlers.onStreamEnd(info.agentId, sessionId);
			} catch {
				// Ignore handler errors
			}
		}
	}

	/**
	 * Handle heartbeat message
	 */
	private handleHeartbeat(connectionId: string): void {
		const info = this.connections.get(connectionId);
		if (!info) return;

		info.lastHeartbeat = Date.now();

		this.send(connectionId, {
			type: 'heartbeat_ack',
			timestamp: Date.now(),
		});
	}

	/**
	 * Handle reconnection request
	 */
	private async handleReconnect(connectionId: string, message: WebSocketIncomingMessage): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info) return;

		const oldSessionId = message.sessionId;
		if (!oldSessionId) {
			this.sendError(connectionId, 'Missing session ID for reconnection');
			return;
		}

		// Try to restore session from store
		let restoredSession: SessionData | null = null;
		if (this.config.sessionStore) {
			restoredSession = await this.config.sessionStore.load(oldSessionId);
		}

		// Check if session can be restored
		if (restoredSession) {
			const now = Date.now();
			const age = now - restoredSession.updatedAt;

			if (age <= SESSION_RECONNECT_WINDOW) {
				// Session is valid for reconnection
				info.sessionId = oldSessionId;

				// Restore session state
				this.updateSessionState(oldSessionId, {
					sessionId: oldSessionId,
					messages: restoredSession.messages,
					lastActivity: restoredSession.updatedAt,
				});

				// Send session state to client
				this.send(connectionId, {
					type: 'session_state',
					sessionId: oldSessionId,
					timestamp: Date.now(),
					metadata: {
						messageCount: restoredSession.messages.length,
						restored: true,
					},
				});
			} else {
				// Session too old
				this.sendError(connectionId, 'Session expired');
			}
		} else {
			// Session not found
			this.sendError(connectionId, 'Session not found');
		}
	}

	/**
	 * Handle connection close
	 */
	private async handleClose(connectionId: string, code: number, reason: string): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info) return;

		// Remove from agent connections
		const agentConns = this.agentConnections.get(info.agentId);
		if (agentConns) {
			agentConns.delete(connectionId);
			if (agentConns.size === 0) {
				this.agentConnections.delete(info.agentId);
			}
		}

		// Persist final session state if needed
		if (this.config.enableSessionPersistence && this.config.sessionStore && info.sessionId) {
			const state = this.sessionStates.get(info.sessionId);
			if (state?.pendingResponse) {
				await this.addMessageToSession(info.sessionId, {
					id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
					role: 'assistant',
					content: state.pendingResponse,
					timestamp: Date.now(),
				});
			}
		}

		// Remove connection
		this.connections.delete(connectionId);

		// Call disconnect handler
		if (this.eventHandlers.onDisconnect) {
			this.eventHandlers.onDisconnect(info.agentId, connectionId, reason);
		}
	}

	/**
	 * Handle connection error
	 */
	private handleError(connectionId: string, error: Error): void {
		const info = this.connections.get(connectionId);
		if (!info) return;

		console.error(`WebSocket error for ${connectionId}:`, error);

		if (this.eventHandlers.onError) {
			this.eventHandlers.onError(info.agentId, connectionId, error);
		}
	}

	/**
	 * Set up WebSocket server event handlers
	 */
	private setupEventHandlers(): void {
		if (!this.wss) return;

		this.wss.on('error', (error: Error) => {
			console.error('WebSocketServer error:', error);
		});
	}

	/**
	 * Start heartbeat monitoring
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			this.performHeartbeat();
		}, this.config.heartbeatInterval);
	}

	/**
	 * Stop heartbeat monitoring
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	/**
	 * Perform heartbeat check on all connections
	 */
	private performHeartbeat(): void {
		const now = Date.now();
		const timeout = this.config.connectionTimeout;

		for (const [connectionId, info] of this.connections) {
			const timeSinceLastHeartbeat = now - info.lastHeartbeat;

			if (timeSinceLastHeartbeat > timeout) {
				// Close stale connection
				this.closeConnection(connectionId, 1008, 'Heartbeat timeout');
			} else if (info.socket.readyState === WebSocket.OPEN) {
				// Send ping for keep-alive
				try {
					info.socket.ping();
				} catch {
					// Connection may be closed
				}
			}
		}
	}

	/**
	 * Send a message to a specific connection
	 * @param connectionId - Target connection ID
	 * @param message - Message to send
	 */
	send(connectionId: string, message: WebSocketOutgoingMessage): boolean {
		const info = this.connections.get(connectionId);
		if (!info || info.socket.readyState !== WebSocket.OPEN) {
			return false;
		}

		try {
			info.socket.send(JSON.stringify(message));
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Send error message to connection
	 */
	private sendError(connectionId: string, error: string): void {
		this.send(connectionId, {
			type: 'error',
			error,
			timestamp: Date.now(),
		});
	}

	/**
	 * Send streaming chunk to connection
	 */
	sendStreamChunk(connectionId: string, sessionId: string, chunk: string): boolean {
		return this.send(connectionId, {
			type: 'stream_chunk',
			sessionId,
			chunk,
			timestamp: Date.now(),
		});
	}

	/**
	 * Send stream end to connection
	 */
	sendStreamEnd(connectionId: string, sessionId: string, content: string): boolean {
		return this.send(connectionId, {
			type: 'stream_end',
			sessionId,
			content,
			done: true,
			timestamp: Date.now(),
		});
	}

	/**
	 * Send response to connection
	 */
	sendResponse(connectionId: string, sessionId: string, content: string): boolean {
		return this.send(connectionId, {
			type: 'response',
			sessionId,
			content,
			timestamp: Date.now(),
		});
	}

	/**
	 * Broadcast message to all connections of an agent
	 */
	broadcastToAgent(agentId: string, message: WebSocketOutgoingMessage): boolean {
		const agentConns = this.agentConnections.get(agentId);
		if (!agentConns || agentConns.size === 0) {
			return false;
		}

		let sent = false;
		const messageStr = JSON.stringify(message);

		for (const connectionId of agentConns) {
			const info = this.connections.get(connectionId);
			if (info && info.socket.readyState === WebSocket.OPEN) {
				try {
					info.socket.send(messageStr);
					sent = true;
				} catch {
					// Continue to next connection
				}
			}
		}

		return sent;
	}

	/**
	 * Broadcast message to all connections
	 */
	broadcast(message: WebSocketOutgoingMessage): void {
		const messageStr = JSON.stringify(message);

		for (const [_connectionId, info] of this.connections) {
			if (info.socket.readyState === WebSocket.OPEN) {
				try {
					info.socket.send(messageStr);
				} catch {
					// Continue to next connection
				}
			}
		}
	}

	/**
	 * Close a specific connection
	 */
	private closeConnection(connectionId: string, code: number, reason: string): Promise<void> {
		const info = this.connections.get(connectionId);
		if (!info) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			try {
				info.socket.close(code, reason);
			} catch {
				// Ignore close errors
			}
			setTimeout(resolve, 100); // Give time for close event
		});
	}

	/**
	 * Update session state
	 */
	private updateSessionState(sessionId: string, state: SessionState): void {
		this.sessionStates.set(sessionId, state);
	}

	/**
	 * Add message to session in session store
	 */
	private async addMessageToSession(sessionId: string, message: SessionMessage): Promise<void> {
		if (!this.config.sessionStore) return;

		try {
			const existingSession = await this.config.sessionStore.load(sessionId);
			const now = Date.now();

			if (existingSession) {
				existingSession.messages.push(message);
				await this.config.sessionStore.save(sessionId, existingSession);
			} else {
				// Create new session
				await this.config.sessionStore.save(sessionId, {
					id: sessionId,
					messages: [message],
					createdAt: now,
					updatedAt: now,
					expiresAt: null,
					metadata: {},
				});
			}
		} catch (err) {
			console.error('Failed to persist session message:', err);
		}
	}

	/**
	 * Generate unique connection ID
	 */
	private generateConnectionId(): string {
		return `ws_${Date.now()}_${(++this.connectionIdCounter).toString(36)}`;
	}

	/**
	 * Get status of all connections
	 */
	getStatus(): {
		running: boolean;
		totalConnections: number;
		connectedAgents: number;
		connections: Array<{
			connectionId: string;
			agentId: string;
			sessionId?: string;
			authenticated: boolean;
			connectedAt: number;
			lastHeartbeat: number;
		}>;
	} {
		const connections: Array<{
			connectionId: string;
			agentId: string;
			sessionId?: string;
			authenticated: boolean;
			connectedAt: number;
			lastHeartbeat: number;
		}> = [];

		for (const [connectionId, info] of this.connections) {
			connections.push({
				connectionId,
				agentId: info.agentId,
				sessionId: info.sessionId,
				authenticated: info.isAuthenticated,
				connectedAt: info.connectedAt,
				lastHeartbeat: info.lastHeartbeat,
			});
		}

		return {
			running: this.isRunning,
			totalConnections: this.connections.size,
			connectedAgents: this.agentConnections.size,
			connections,
		};
	}

	/**
	 * Check if an agent has any active connections
	 */
	isAgentConnected(agentId: string): boolean {
		const agentConns = this.agentConnections.get(agentId);
		return agentConns !== undefined && agentConns.size > 0;
	}

	/**
	 * Get connection IDs for an agent
	 */
	getAgentConnections(agentId: string): string[] {
		const agentConns = this.agentConnections.get(agentId);
		return agentConns ? Array.from(agentConns) : [];
	}

	/**
	 * Get session state
	 */
	getSessionState(sessionId: string): SessionState | undefined {
		return this.sessionStates.get(sessionId);
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new WebSocketHandler instance
 * @param config - Optional handler configuration
 */
export function createWebSocketHandler(config?: WebSocketHandlerConfig): WebSocketHandler {
	return new WebSocketHandler(config);
}