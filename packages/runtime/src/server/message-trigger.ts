/**
 * Message Trigger - Message-driven agent trigger system
 *
 * Converts HTTP/WebSocket messages into agent prompts and routes them
 * to the appropriate agent sessions. Integrates with the Hook system
 * for persistent work tracking.
 */

import type { AgentRegistry } from '../agents.js';
import type { HookManager } from '../hooks/hook-manager.js';
import type { SessionStore } from '../session-store.js';
import type { Harness } from '../harness.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Incoming message from HTTP or WebSocket
 */
export interface IncomingMessage {
	/** Message type */
	type: 'prompt' | 'nudge' | 'dispatch';
	/** Source (http | websocket) */
	source: 'http' | 'websocket';
	/** Agent name */
	agentName: string;
	/** Session ID (optional for new sessions) */
	sessionId?: string;
	/** Message payload */
	payload: {
		/** The actual message/prompt */
		message?: string;
		/** Context data */
		context?: Record<string, unknown>;
		/** Priority (for hooks) */
		priority?: 'P0' | 'P1' | 'P2' | 'P3';
	};
	/** Metadata */
	metadata?: {
		/** Request ID for tracing */
		requestId?: string;
		/** Timestamp */
		timestamp?: number;
		/** User ID (if authenticated) */
		userId?: string;
	};
}

/**
 * Message trigger configuration
 */
export interface MessageTriggerConfig {
	/** Agent registry */
	agents: AgentRegistry;
	/** Hook manager (optional) */
	hooks?: HookManager;
	/** Session store */
	sessions: SessionStore;
	/** Default model for agents */
	defaultModel?: string;
}

/**
 * Message routing result
 */
export interface RoutingResult {
	/** Whether routing succeeded */
	success: boolean;
	/** Session ID used */
	sessionId: string;
	/** Agent instance */
	harness?: Harness;
	/** Error message if failed */
	error?: string;
}

// ============================================================================
// MessageTrigger Class
// ============================================================================

/**
 * Message-driven agent trigger system
 *
 * Converts incoming HTTP/WebSocket messages into agent prompts and
 * routes them to appropriate agent sessions. Creates hooks for
 * persistent work tracking.
 */
export class MessageTrigger {
	private config: MessageTriggerConfig;
	private activeSessions: Map<string, Harness> = new Map();

	constructor(config: MessageTriggerConfig) {
		this.config = config;
	}

	/**
	 * Handle an incoming HTTP message
	 */
	async handleHTTP(
		body: Record<string, unknown>,
		headers: Record<string, string>
	): Promise<RoutingResult> {
		const message: IncomingMessage = {
			type: body.type as 'prompt' | 'nudge' | 'dispatch' || 'prompt',
			source: 'http',
			agentName: body.agentName as string,
			sessionId: body.sessionId as string | undefined,
			payload: {
				message: body.message as string,
				context: body.context as Record<string, unknown>,
				priority: body.priority as 'P0' | 'P1' | 'P2' | 'P3' | undefined,
			},
			metadata: {
				requestId: headers['x-request-id'],
				timestamp: Date.now(),
				userId: headers['x-user-id'],
			},
		};

		return this.routeMessage(message);
	}

	/**
	 * Handle an incoming WebSocket message
	 */
	async handleWebSocket(
		sessionId: string,
		data: Record<string, unknown>
	): Promise<RoutingResult> {
		const message: IncomingMessage = {
			type: data.type as 'prompt' | 'nudge' | 'dispatch' || 'prompt',
			source: 'websocket',
			agentName: data.agentName as string,
			sessionId: sessionId,
			payload: {
				message: data.message as string,
				context: data.context as Record<string, unknown>,
				priority: data.priority as 'P0' | 'P1' | 'P2' | 'P3' | undefined,
			},
			metadata: {
				requestId: data.requestId as string,
				timestamp: Date.now(),
			},
		};

		return this.routeMessage(message);
	}

	/**
	 * Route a message to the appropriate agent
	 */
	private async routeMessage(message: IncomingMessage): Promise<RoutingResult> {
		try {
			// Get or create session ID
			const sessionId = message.sessionId || this.generateSessionId(message.agentName);

			// Create or get harness for this session
			const harness = await this.getOrCreateHarness(message.agentName, sessionId);

			// Create hook if hooks are configured and this is a prompt
			if (this.config.hooks && message.type === 'prompt') {
				await this.createHook(message, sessionId);
			}

			// Route based on message type
			switch (message.type) {
				case 'prompt':
					return await this.handlePrompt(harness, message, sessionId);
				case 'nudge':
					return await this.handleNudge(harness, message, sessionId);
				case 'dispatch':
					return await this.handleDispatch(harness, message, sessionId);
				default:
					return {
						success: false,
						sessionId,
						error: `Unknown message type: ${message.type}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				sessionId: message.sessionId || 'unknown',
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Handle a prompt message
	 */
	private async handlePrompt(
		harness: Harness,
		message: IncomingMessage,
		sessionId: string
	): Promise<RoutingResult> {
		try {
			const session = await harness.session();

			// Send the prompt
			const response = await session.prompt(message.payload.message || '', {
				context: message.payload.context,
			});

			return {
				success: true,
				sessionId,
				harness,
			};
		} catch (error) {
			return {
				success: false,
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Handle a nudge message (immediate wake-up)
	 */
	private async handleNudge(
		harness: Harness,
		message: IncomingMessage,
		sessionId: string
	): Promise<RoutingResult> {
		// Nudge is immediate - send a wake-up prompt
		try {
			const session = await harness.session();
			const response = await session.prompt(
				`[NUDGE] ${message.payload.message || 'Wake up and check your hooks'}`
			);

			return {
				success: true,
				sessionId,
				harness,
			};
		} catch (error) {
			return {
				success: false,
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Handle a dispatch message (work assignment)
	 */
	private async handleDispatch(
		harness: Harness,
		message: IncomingMessage,
		sessionId: string
	): Promise<RoutingResult> {
		// Dispatch creates a hook for work tracking
		try {
			const session = await harness.session();

			// Dispatch to agent with context
			const response = await session.prompt(
				`[DISPATCH] ${message.payload.message || 'New work assigned'}`
			);

			return {
				success: true,
				sessionId,
				harness,
			};
		} catch (error) {
			return {
				success: false,
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get or create a harness for an agent
	 */
	private async getOrCreateHarness(agentName: string, sessionId: string): Promise<Harness> {
		const key = `${agentName}:${sessionId}`;

		// Check if we already have this harness
		if (this.activeSessions.has(key)) {
			return this.activeSessions.get(key)!;
		}

		// Create new harness
		const agent = await this.config.agents.get(agentName);
		if (!agent) {
			throw new Error(`Agent not found: ${agentName}`);
		}

		const harness = await agent.createHarness();
		this.activeSessions.set(key, harness);

		return harness;
	}

	/**
	 * Create a hook for work tracking
	 */
	private async createHook(message: IncomingMessage, sessionId: string): Promise<void> {
		if (!this.config.hooks) return;

		await this.config.hooks.create({
			agentId: message.agentName,
			type: 'agent',
			status: 'pending',
			priority: message.payload.priority || 'P2',
			metadata: {
				sessionId,
				source: message.source,
				requestId: message.metadata?.requestId,
			},
		});
	}

	/**
	 * Generate a session ID
	 */
	private generateSessionId(agentName: string): string {
		return `${agentName}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get active session count
	 */
	getActiveSessionCount(): number {
		return this.activeSessions.size;
	}

	/**
	 * Close a session
	 */
	closeSession(agentName: string, sessionId: string): void {
		const key = `${agentName}:${sessionId}`;
		this.activeSessions.delete(key);
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a message trigger instance
 */
export function createMessageTrigger(config: MessageTriggerConfig): MessageTrigger {
	return new MessageTrigger(config);
}