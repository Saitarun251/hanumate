/**
 * Nudge WebSocket Client
 *
 * Provides WebSocket client functionality for agent-to-agent nudging.
 * Supports auto-reconnection, heartbeat, and message delivery.
 */

import type { NudgeMessage, NudgeType, NudgePayload } from './nudge-types.js';
import { generateNudgeId } from './nudge-types.js';

// Re-export types for convenience
export type { NudgeMessage, NudgeType, NudgePayload } from './nudge-types.js';

/**
 * Configuration for NudgeClient
 */
export interface NudgeClientConfig {
	/** Agent ID for this client (required for identification) */
	agentId: string;
	/** Heartbeat interval in milliseconds (default: 30000) */
	heartbeatInterval?: number;
	/** Connection timeout in milliseconds (default: 10000) */
	connectionTimeout?: number;
	/** Maximum reconnection attempts (default: 5) */
	maxReconnectAttempts?: number;
	/** Base delay for exponential backoff in milliseconds (default: 1000) */
	reconnectBaseDelay?: number;
	/** Maximum reconnect delay in milliseconds (default: 30000) */
	reconnectMaxDelay?: number;
	/** Enable debug logging (default: false) */
	debug?: boolean;
}

/**
 * Internal connection state
 */
interface ConnectionState {
	socket: WebSocket | null;
	connected: boolean;
	reconnectAttempts: number;
	reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
	heartbeatIntervalId: ReturnType<typeof setInterval> | null;
	lastHeartbeat: number;
}

/**
 * Nudge WebSocket Client
 *
 * Connects to Nudge server and provides agent-to-agent nudging capabilities.
 */
export class NudgeClient {
	private config: Required<NudgeClientConfig>;
	private state: ConnectionState;
	private nudgeHandlers: Array<(nudge: NudgeMessage) => void> = [];
	private serverUrl: string | null = null;

	constructor(config: NudgeClientConfig) {
		// Validate required config
		if (!config.agentId) {
			throw new Error('agentId is required for NudgeClient');
		}

		// Apply defaults
		this.config = {
			agentId: config.agentId,
			heartbeatInterval: config.heartbeatInterval ?? 30000,
			connectionTimeout: config.connectionTimeout ?? 10000,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
			reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
			reconnectMaxDelay: config.reconnectMaxDelay ?? 30000,
			debug: config.debug ?? false,
		};

		// Initialize connection state
		this.state = {
			socket: null,
			connected: false,
			reconnectAttempts: 0,
			reconnectTimeoutId: null,
			heartbeatIntervalId: null,
			lastHeartbeat: Date.now(),
		};

		this.debug('NudgeClient initialized with agentId:', this.config.agentId);
	}

	/**
	 * Connect to Nudge server
	 */
	async connect(serverUrl: string): Promise<void> {
		if (this.state.socket) {
			this.debug('Already connected, disconnecting first...');
			await this.disconnect();
		}

		this.serverUrl = serverUrl;
		this.debug('Connecting to:', serverUrl);

		return new Promise((resolve, reject) => {
			try {
				const socket = new WebSocket(serverUrl);
				let closed = false;

				socket.onclose = () => {
					// Check if we need to reject BEFORE setting closed flag
					if (!this.state.connected) {
						closed = true;
						// Don't double-reject if timeout already settled the promise
						try {
							reject(new Error('Connection timeout'));
						} catch {
							// Already rejected by timeout
						}
					} else {
						closed = true;
					}
				};

				const timeoutId = setTimeout(() => {
					// Only reject if socket never opened and hasn't already closed
					if (!closed && socket.readyState !== WebSocket.OPEN) {
						socket.close();
						// Reject, but don't double-reject if onclose already fired
						if (!closed) {
							reject(new Error('Connection timeout'));
						}
					}
				}, this.config.connectionTimeout);

				socket.onopen = () => {
					clearTimeout(timeoutId);
					this.handleConnect(socket);
					resolve();
				};

				socket.onerror = (event) => {
					clearTimeout(timeoutId);
					this.debug('WebSocket error:', event);
					reject(new Error('WebSocket connection error'));
				};
			} catch (error) {
				this.debug('Failed to create WebSocket:', error);
				reject(error);
			}
		});
	}

	/**
	 * Handle successful connection
	 */
	private handleConnect(socket: WebSocket): void {
		this.state.socket = socket;
		this.state.connected = true;
		this.state.reconnectAttempts = 0;
		this.state.lastHeartbeat = Date.now();

		// Register this agent with the server
		this.sendRegistration();

		// Set up message handler
		socket.onmessage = (event) => {
			this.handleMessage(event);
		};

		// Set up close handler
		socket.onclose = (event) => {
			this.debug('WebSocket closed:', event.code, event.reason);
			this.handleDisconnect();
		};

		// Set up error handler
		socket.onerror = (event) => {
			this.debug('WebSocket error:', event);
		};

		// Start heartbeat
		this.startHeartbeat();

		this.debug('Connected and registered as:', this.config.agentId);
	}

	/**
	 * Send registration message to server
	 */
	private sendRegistration(): void {
		const registration = {
			type: 'register',
			agentId: this.config.agentId,
			timestamp: Date.now(),
		};
		this.sendRaw(registration);
	}

	/**
	 * Handle incoming WebSocket message
	 */
	private handleMessage(event: MessageEvent): void {
		try {
			const data = JSON.parse(event.data);
			this.debug('Received message:', data);

			// Handle heartbeat response
			if (data.type === 'heartbeat') {
				this.state.lastHeartbeat = Date.now();
				return;
			}

			// Handle nudge messages
			if (data.type === 'nudge') {
				const nudge = data.payload as NudgeMessage;
				this.debug('Received nudge:', nudge.id, 'from:', nudge.from);

				// Only deliver to handlers if this nudge is for us
				if (nudge.to === this.config.agentId || nudge.to === '*') {
					this.notifyHandlers(nudge);
				}
				return;
			}

			// Handle pong (heartbeat response)
			if (data.type === 'pong') {
				this.state.lastHeartbeat = Date.now();
				return;
			}
		} catch (error) {
			this.debug('Error parsing message:', error);
		}
	}

	/**
	 * Handle disconnection
	 */
	private handleDisconnect(): void {
		this.state.connected = false;
		this.stopHeartbeat();

		// Attempt reconnection if we were previously connected
		if (this.serverUrl && this.state.reconnectAttempts < this.config.maxReconnectAttempts) {
			this.scheduleReconnect();
		}
	}

	/**
	 * Schedule reconnection with exponential backoff
	 */
	private scheduleReconnect(): void {
		if (this.state.reconnectTimeoutId) {
			clearTimeout(this.state.reconnectTimeoutId);
		}

		const attempts = this.state.reconnectAttempts;
		const delay = Math.min(
			this.config.reconnectBaseDelay * Math.pow(2, attempts),
			this.config.reconnectMaxDelay
		);

		this.state.reconnectAttempts++;
		this.debug(
			`Scheduling reconnect attempt ${this.state.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`
		);

		this.state.reconnectTimeoutId = setTimeout(() => {
			if (this.serverUrl && this.state.reconnectAttempts < this.config.maxReconnectAttempts) {
				this.debug('Attempting reconnection...');
				this.connect(this.serverUrl).catch((error) => {
					this.debug('Reconnection failed:', error);
				});
			}
		}, delay);
	}

	/**
	 * Start heartbeat interval
	 */
	private startHeartbeat(): void {
		this.stopHeartbeat();

		this.state.heartbeatIntervalId = setInterval(() => {
			if (this.state.connected && this.state.socket) {
				this.sendHeartbeat();
			}
		}, this.config.heartbeatInterval);
	}

	/**
	 * Stop heartbeat interval
	 */
	private stopHeartbeat(): void {
		if (this.state.heartbeatIntervalId) {
			clearInterval(this.state.heartbeatIntervalId);
			this.state.heartbeatIntervalId = null;
		}
	}

	/**
	 * Send heartbeat ping
	 */
	private sendHeartbeat(): void {
		const heartbeat = {
			type: 'heartbeat',
			agentId: this.config.agentId,
			timestamp: Date.now(),
		};
		this.sendRaw(heartbeat);
	}

	/**
	 * Send raw JSON data through the socket
	 */
	private sendRaw(data: object): void {
		if (this.state.socket && this.state.connected) {
			this.state.socket.send(JSON.stringify(data));
		} else {
			this.debug('Cannot send, not connected');
		}
	}

	/**
	 * Notify all registered handlers of a nudge
	 */
	private notifyHandlers(nudge: NudgeMessage): void {
		for (const handler of this.nudgeHandlers) {
			try {
				handler(nudge);
			} catch (error) {
				this.debug('Handler error:', error);
			}
		}
	}

	/**
	 * Disconnect from Nudge server
	 */
	async disconnect(): Promise<void> {
		this.debug('Disconnecting...');

		// Clear timers
		if (this.state.reconnectTimeoutId) {
			clearTimeout(this.state.reconnectTimeoutId);
			this.state.reconnectTimeoutId = null;
		}
		this.stopHeartbeat();

		// Close socket
		if (this.state.socket) {
			// Send disconnect message
			this.sendRaw({
				type: 'disconnect',
				agentId: this.config.agentId,
				timestamp: Date.now(),
			});

			this.state.socket.close();
			this.state.socket = null;
		}

		this.state.connected = false;
		this.state.reconnectAttempts = this.config.maxReconnectAttempts; // Prevent auto-reconnect
		this.debug('Disconnected');
	}

	/**
	 * Send a nudge to another agent
	 * @returns The nudge ID
	 * @throws Error if not connected
	 */
	send(to: string, type: NudgeType, payload?: unknown): string {
		if (!this.isConnected()) {
			throw new Error('Cannot send nudge: not connected to Nudge server');
		}

		const nudge: NudgeMessage = {
			id: generateNudgeId(),
			from: this.config.agentId,
			to,
			type,
			payload: this.normalizePayload(payload),
			createdAt: Date.now(),
		};

		this.debug('Sending nudge:', nudge.id, 'to:', to, 'type:', type);

		const message = {
			type: 'nudge',
			payload: nudge,
		};
		this.sendRaw(message);

		return nudge.id;
	}

	/**
	 * Normalize payload to NudgePayload format
	 */
	private normalizePayload(payload?: unknown): NudgePayload {
		if (!payload) {
			return {};
		}
		if (typeof payload === 'object') {
			return payload as NudgePayload;
		}
		return { metadata: { value: payload } };
	}

	/**
	 * Register a handler for incoming nudges
	 */
	onNudge(handler: (nudge: NudgeMessage) => void): void {
		this.nudgeHandlers.push(handler);
		this.debug('Registered nudge handler, total:', this.nudgeHandlers.length);
	}

	/**
	 * Check if currently connected
	 */
	isConnected(): boolean {
		return this.state.connected && this.state.socket !== null;
	}

	/**
	 * Debug logging
	 */
	private debug(...args: unknown[]): void {
		if (this.config.debug) {
			console.log(`[NudgeClient:${this.config.agentId}]`, ...args);
		}
	}
}