/**
 * Nudge Server - WebSocket server for real-time agent communication
 *
 * Provides a WebSocket-based real-time messaging system for agent wake-ups,
 * work dispatch, interrupts, and heartbeat monitoring.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type {
	NudgeMessage,
	NudgeConfig,
	NudgeConnection,
} from './nudge-types.js';
import { generateNudgeId } from './nudge-types.js';

// Default configuration values
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const DEFAULT_CONNECTION_TIMEOUT = 60000; // 60 seconds

/**
 * Connection info stored for each WebSocket client
 */
interface ConnectionInfo {
	connectionId: string;
	agentId: string;
	socket: WebSocket;
	connectedAt: number;
	lastHeartbeat: number;
}

/**
 * NudgeServer - WebSocket server for real-time agent communication
 *
 * Manages WebSocket connections for agents and handles nudge message
 * routing, heartbeat monitoring, and connection lifecycle.
 */
export class NudgeServer {
	private wss: WebSocketServer | null = null;
	private connections: Map<string, ConnectionInfo> = new Map();
	private agentConnections: Map<string, Set<string>> = new Map(); // agentId -> Set of connectionIds
	private config: Required<NudgeConfig>;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private nudgeHandler: ((nudge: NudgeMessage) => void) | null = null;
	private connectHandler: ((connection: NudgeConnection) => void) | null = null;
	private disconnectHandler: ((connection: NudgeConnection) => void) | null = null;
	private isRunning: boolean = false;

	/**
	 * Create a new NudgeServer instance
	 * @param config - Optional server configuration
	 */
	constructor(config?: NudgeConfig) {
		this.config = {
			port: config?.port ?? DEFAULT_PORT,
			host: config?.host ?? DEFAULT_HOST,
			path: config?.path ?? '/nudge',
			heartbeatInterval: config?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
			connectionTimeout: config?.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
			maxReconnectAttempts: config?.maxReconnectAttempts ?? 5,
			agentId: config?.agentId ?? '',
		};
	}

	/**
	 * Start the WebSocket server
	 * @param port - Optional port override (uses config port if not provided)
	 */
	async start(port?: number): Promise<void> {
		if (this.isRunning) {
			throw new Error('NudgeServer is already running');
		}

		const serverPort = port ?? this.config.port;

		this.wss = new WebSocketServer({
			host: this.config.host,
			port: serverPort,
		});

		this.setupEventHandlers();
		this.startHeartbeat();
		this.isRunning = true;

		return new Promise<void>((resolve) => {
			if (this.wss) {
				this.wss.on('listening', () => {
					resolve();
				});
			}
		});
	}

	/**
	 * Stop the WebSocket server and close all connections
	 */
	async stop(timeoutMs = 5000): Promise<void> {
		if (!this.isRunning || !this.wss) {
			return;
		}

		// Stop heartbeat
		this.stopHeartbeat();

		// Close all client connections
		for (const [_connectionId, info] of this.connections) {
			try {
				info.socket.removeAllListeners();
				info.socket.terminate();
			} catch {
				// Ignore errors during shutdown
			}
		}

		// Clear connection maps
		this.connections.clear();
		this.agentConnections.clear();

		// Close server with timeout
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.isRunning = false;
				this.wss = null;
				resolve();
			}, timeoutMs);

			if (this.wss) {
				this.wss.close((err?: Error) => {
					clearTimeout(timeout);
					if (err) {
						reject(err);
					} else {
						this.wss = null;
						this.isRunning = false;
						resolve();
					}
				});
			} else {
				clearTimeout(timeout);
				this.isRunning = false;
				resolve();
			}
		});
	}

	/**
	 * Register a handler for incoming nudge messages
	 * @param handler - Callback function to handle nudge messages
	 */
	onNudge(handler: (nudge: NudgeMessage) => void): void {
		this.nudgeHandler = handler;
	}

	/**
	 * Register a handler for connection events
	 * @param handler - Callback function to handle connect events
	 */
	onConnect(handler: (connection: NudgeConnection) => void): void {
		this.connectHandler = handler;
	}

	/**
	 * Register a handler for disconnection events
	 * @param handler - Callback function to handle disconnect events
	 */
	onDisconnect(handler: (connection: NudgeConnection) => void): void {
		this.disconnectHandler = handler;
	}

	/**
	 * Send a nudge message to a specific agent
	 * @param to - Recipient agent ID
	 * @param nudge - Nudge message to send
	 * @returns true if message was sent, false if recipient not found
	 */
	send(to: string, nudge: NudgeMessage): boolean {
		const agentConns = this.agentConnections.get(to);
		if (!agentConns || agentConns.size === 0) {
			return false;
		}

		const messageStr = JSON.stringify({ type: 'nudge', payload: nudge });
		let sent = false;

		for (const connectionId of agentConns) {
			const info = this.connections.get(connectionId);
			if (info && info.socket.readyState === WebSocket.OPEN) {
				try {
					info.socket.send(messageStr);
					sent = true;
				} catch (error) {
					// Continue trying other connections
				}
			}
		}

		return sent;
	}

	/**
	 * Broadcast a nudge message to all connected agents
	 * @param nudge - Nudge message to broadcast
	 */
	broadcast(nudge: NudgeMessage): void {
		const messageStr = JSON.stringify({ type: 'nudge', payload: nudge });

		for (const [connectionId, info] of this.connections) {
			if (info.socket.readyState === WebSocket.OPEN) {
				try {
					info.socket.send(messageStr);
				} catch (error) {
					// Continue broadcasting to other connections
				}
			}
		}
	}

	/**
	 * Get list of all connected agent IDs
	 * @returns Array of connected agent IDs
	 */
	getConnectedAgents(): string[] {
		return Array.from(this.agentConnections.keys());
	}

	/**
	 * Check if a specific agent is connected
	 * @param agentId - Agent ID to check
	 * @returns true if agent is connected
	 */
	isAgentConnected(agentId: string): boolean {
		const agentConns = this.agentConnections.get(agentId);
		return agentConns !== undefined && agentConns.size > 0;
	}

	/**
	 * Get the actual port the server is listening on
	 */
	getPort(): number {
		if (!this.wss) return 0;
		const addr = this.wss.address();
		if (!addr) return 0;
		return typeof addr === 'string' ? 0 : addr.port;
	}

	/**
	 * Get server status
	 */
	getStatus(): { running: boolean; connectedAgents: number; totalConnections: number; port: number } {
		return {
			running: this.isRunning,
			connectedAgents: this.agentConnections.size,
			totalConnections: this.connections.size,
			port: this.getPort(),
		};
	}

	/**
	 * Set up WebSocket event handlers
	 */
	private setupEventHandlers(): void {
		if (!this.wss) return;

		this.wss.on('connection', (socket: WebSocket, request) => {
			this.handleConnection(socket, request);
		});

		this.wss.on('error', (error: Error) => {
			console.error('NudgeServer WebSocket error:', error);
		});
	}

	/**
	 * Handle a new WebSocket connection
	 */
	private handleConnection(socket: WebSocket, request: IncomingMessage): void {
		const connectionId = generateNudgeId();
		let agentId = 'unknown';
		let registered = false;

		// Send registration challenge
		const challenge = {
			type: 'register',
			payload: { connectionId },
		};

		socket.send(JSON.stringify(challenge));

		const handleMessage = (data: unknown): void => {
			// Parse message
			let message: { type?: string; agentId?: string; [key: string]: unknown };
			try {
				// Handle both string and Buffer data (ws can send either)
				if (typeof data === 'object' && data !== null && Buffer.isBuffer(data)) {
					data = (data as Buffer).toString('utf-8');
				}
				if (typeof data !== 'string') {
					return;
				}
				message = JSON.parse(data);
			} catch {
				// Invalid JSON - ignore
				return;
			}

			// Handle registration
			if (message.type === 'register' && message.agentId) {
				if (registered) return; // Already registered
				registered = true;
				agentId = message.agentId as string;

				// Store connection info
				const info: ConnectionInfo = {
					connectionId,
					agentId,
					socket,
					connectedAt: Date.now(),
					lastHeartbeat: Date.now(),
				};
				this.connections.set(connectionId, info);

				// Update agent connections map
				if (!this.agentConnections.has(agentId)) {
					this.agentConnections.set(agentId, new Set());
				}
				this.agentConnections.get(agentId)!.add(connectionId);

				// Send acknowledgment
				socket.send(JSON.stringify({
					type: 'registered',
					payload: { connectionId, agentId },
				}));

				// Call connect handler
				if (this.connectHandler) {
					const connection: NudgeConnection = {
						id: connectionId,
						agentId,
						active: true,
						connectedAt: info.connectedAt,
						lastHeartbeat: info.lastHeartbeat,
						send: async (msg: NudgeMessage) => {
							if (socket.readyState === WebSocket.OPEN) {
								socket.send(JSON.stringify(msg));
							}
						},
						close: async () => {
							socket.close(1000, 'Client requested close');
						},
					};
					this.connectHandler(connection);
				}
			}

			// Handle nudge messages
			else if (message.type === 'nudge' && message.payload) {
				const nudge = message.payload as NudgeMessage;
				if (this.nudgeHandler && this.validateNudgeMessage(nudge)) {
					this.nudgeHandler(nudge);
				}
			}

			// Handle heartbeat response
			else if (message.type === 'pong') {
				const info = this.connections.get(connectionId);
				if (info) {
					info.lastHeartbeat = Date.now();
				}
			}
		};

		const handleClose = (code: number, reason: Buffer): void => {
			// Remove connection
			const info = this.connections.get(connectionId);
			if (info) {
				// Update agent connections map
				const agentConns = this.agentConnections.get(info.agentId);
				if (agentConns) {
					agentConns.delete(connectionId);
					if (agentConns.size === 0) {
						this.agentConnections.delete(info.agentId);
					}
				}

				// Call disconnect handler
				if (this.disconnectHandler) {
					const connection: NudgeConnection = {
						id: connectionId,
						agentId: info.agentId,
						active: false,
						connectedAt: info.connectedAt,
						lastHeartbeat: info.lastHeartbeat,
						send: async () => { /* No-op */ },
						close: async () => { /* Already closed */ },
					};
					this.disconnectHandler(connection);
				}

				this.connections.delete(connectionId);
			}

			// Clean up listeners
			socket.removeListener('message', handleMessage);
			socket.removeListener('close', handleClose);
			socket.removeAllListeners();
		};

		const handleError = (error: Error): void => {
			console.error(`NudgeServer connection error (${connectionId}):`, error);
			// Connection will be closed after error, handleClose will be called
		};

		socket.on('message', (data: Buffer | string) => handleMessage(data));
		socket.on('close', () => handleClose(1000, Buffer.from('Normal closure')));
		socket.on('error', (event: Error) => handleError(event));
	}

	/**
	 * Validate a nudge message structure
	 */
	private validateNudgeMessage(msg: unknown): msg is NudgeMessage {
		if (typeof msg !== 'object' || msg === null) {
			return false;
		}
		const m = msg as Record<string, unknown>;
		return (
			typeof m.id === 'string' &&
			typeof m.from === 'string' &&
			typeof m.to === 'string' &&
			typeof m.type === 'string' &&
			typeof m.createdAt === 'number' &&
			(m.payload === undefined || typeof m.payload === 'object')
		);
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

			// Check for stale connections
			if (timeSinceLastHeartbeat > timeout) {
				// Close stale connection
				try {
					info.socket.close(1008, 'Heartbeat timeout');
				} catch {
					// Ignore close errors
				}
				continue;
			}

			// Send ping if connection is open
			if (info.socket.readyState === WebSocket.OPEN) {
				try {
					info.socket.ping();
				} catch {
					// Connection may have been closed
				}
			}
		}
	}
}

/**
 * Factory function to create a new NudgeServer instance
 * @param config - Optional server configuration
 */
export function createNudgeServer(config?: NudgeConfig): NudgeServer {
	return new NudgeServer(config);
}