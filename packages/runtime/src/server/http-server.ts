/**
 * HTTP Server - Hono-based HTTP server for Hanumate runtime
 *
 * Provides REST API endpoints for agent management, session handling,
 * health checks, and WebSocket support for real-time communication.
 */

import { Hono } from 'hono';
import http from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentRegistry } from '../agents.js';
import type { HookManager } from '../hooks/hook-manager.js';
import type { BeadStore } from '../beads/bead-types.js';
import type { SessionStore, SessionData } from '../session-store.js';
import { generateSessionId } from '../session-store.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Server configuration options
 */
export interface HttpServerConfig {
	/** Agent registry for managing agents */
	agents: AgentRegistry;
	/** Hook manager for work queue management */
	hooks?: HookManager;
	/** Bead store for issue tracking */
	beads?: BeadStore;
	/** Session store for session persistence */
	sessions?: SessionStore;
	/** Base path for API routes (default: /) */
	basePath?: string;
}

/**
 * Server instance returned by createServer
 */
export interface HttpServer {
	/** Start the HTTP server on the specified port */
	start(port: number): Promise<void>;
	/** Stop the HTTP server */
	stop(): Promise<void>;
	/** Get the underlying Hono app for adding routes */
	app: Hono;
	/** Get the HTTP server instance */
	httpServer: http.Server;
	/** Check if server is running */
	isRunning(): boolean;
	/** Get the port server is listening on */
	getPort(): number;
}

/**
 * Health check response
 */
export interface HealthResponse {
	status: 'ok' | 'degraded' | 'error';
	timestamp: number;
	uptime: number;
	version: string;
	checks: {
		agents: { status: string; count: number };
		hooks?: { status: string; pending: number; active: number };
		beads?: { status: string; count: number };
		sessions?: { status: string; count: number };
	};
}

/**
 * Agent prompt request body
 */
export interface AgentPromptRequest {
	prompt: string;
	sessionId?: string;
	context?: Record<string, unknown>;
}

/**
 * Agent prompt response
 */
export interface AgentPromptResponse {
	success: boolean;
	sessionId?: string;
	response?: string;
	error?: string;
}

/**
 * Session info response
 */
export interface SessionInfoResponse {
	sessionId: string;
	exists: boolean;
	data?: SessionData;
	list?: Array<{
		sessionId: string;
		agentId?: string;
		createdAt?: number;
		messageCount?: number;
	}>;
}

/**
 * WebSocket connection info for an agent
 */
interface AgentWsConnection {
	socket: WebSocket;
	connectedAt: number;
	sessionId?: string;
}

// ============================================================================
// Server Implementation
// ============================================================================

/**
 * Create an HTTP server with Hono
 *
 * @param config - Server configuration
 * @returns HttpServer instance
 *
 * @example
 * ```typescript
 * import { createServer } from './server/http-server.js';
 *
 * const server = createServer({
 *   agents: agentRegistry,
 *   hooks: hookManager,
 *   beads: beadStore,
 * });
 *
 * await server.start(3000);
 * ```
 */
export function createServer(config: HttpServerConfig): HttpServer {
	const app = new Hono();
	const httpServerInstance = http.createServer();

	// WebSocket connections mapped by agent ID
	const wsConnections = new Map<string, AgentWsConnection>();

	// Server start time for uptime calculation
	const startTime = Date.now();

	// Track if server is running
	let running = false;
	let listeningPort = 0;

	// =========================================================================
	// Middleware
	// =========================================================================

	// Request logging middleware
	app.use('*', async (c, next) => {
		const start = Date.now();
		await next();
		const ms = Date.now() - start;
		console.log(`${c.req.method} ${c.req.path} - ${c.res.status} (${ms}ms)`);
	});

	// CORS middleware for development
	app.use('*', async (c, next) => {
		c.header('Access-Control-Allow-Origin', '*');
		c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		if (c.req.method === 'OPTIONS') {
			c.header('Content-Length', '0');
			return c.body(null, 204);
		}
		await next();
	});

	// =========================================================================
	// Health Check Endpoint
	// =========================================================================

	app.get('/health', async (c) => {
		const hooksChecks = config.hooks ? {
			status: 'ok' as const,
			pending: (await config.hooks.listByStatus('pending')).length,
			active: (await config.hooks.listByStatus('active')).length,
		} : undefined;

		const beadsChecks = config.beads ? {
			status: 'ok' as const,
			count: (await config.beads.list()).length,
		} : undefined;

		const sessionsChecks = config.sessions ? {
			status: 'ok' as const,
			count: (await config.sessions.list()).length,
		} : undefined;

		const response: HealthResponse = {
			status: 'ok',
			timestamp: Date.now(),
			uptime: Math.floor((Date.now() - startTime) / 1000),
			version: '0.1.0',
			checks: {
				agents: {
					status: 'ok',
					count: config.agents.list().length,
				},
				hooks: hooksChecks,
				beads: beadsChecks,
				sessions: sessionsChecks,
			},
		};

		// Determine overall health status
		const checks = response.checks;
		const hasIssues = Object.values(checks).some(check => {
			if (!check) return false;
			return check.status !== 'ok';
		});

		if (hasIssues) {
			response.status = 'degraded';
		}

		return c.json(response);
	});

	// =========================================================================
	// Agent Endpoints
	// =========================================================================

	// POST /agents/:name/:id/prompt - Send a prompt to an agent
	app.post('/agents/:name/:id/prompt', async (c) => {
		const agentName = c.req.param('name');
		const agentId = c.req.param('id');

		// Validate agent exists
		const agent = config.agents.get(agentId);
		if (!agent) {
			return c.json({
				success: false,
				error: `Agent not found: ${agentId}`,
			}, 404);
		}

		// Parse request body
		let body: AgentPromptRequest;
		try {
			body = await c.req.json();
		} catch {
			return c.json({
				success: false,
				error: 'Invalid JSON body',
			}, 400);
		}

		if (!body.prompt || typeof body.prompt !== 'string') {
			return c.json({
				success: false,
				error: 'Missing or invalid prompt',
			}, 400);
		}

		// Get or create session
		const sessionId = body.sessionId ?? (config.sessions ? generateSessionId() : undefined);

		// Store session if sessions store is available
		if (config.sessions && sessionId) {
			const existingSession = await config.sessions.load(sessionId);
			const now = Date.now();

			if (existingSession) {
				// Add user message to existing session
				existingSession.messages.push({
					id: `msg_${now}_${Math.random().toString(36).substring(2, 15)}`,
					role: 'user',
					content: body.prompt,
					timestamp: now,
				});
				await config.sessions.save(sessionId, existingSession);
			} else {
				// Create new session
				await config.sessions.save(sessionId, {
					id: sessionId,
					messages: [{
						id: `msg_${now}_${Math.random().toString(36).substring(2, 15)}`,
						role: 'user',
						content: body.prompt,
						timestamp: now,
					}],
					createdAt: now,
					updatedAt: now,
					expiresAt: null,
					metadata: {
						agentId,
					},
				});
			}
		}

		// Simulate agent response (in real implementation, this would call the actual agent)
		const response = `Agent ${agentName} (${agentId}) received prompt: ${body.prompt.substring(0, 50)}...`;

		const promptResponse: AgentPromptResponse = {
			success: true,
			sessionId,
			response,
		};

		return c.json(promptResponse);
	});

	// =========================================================================
	// Session Management Endpoints
	// =========================================================================

	// GET /agents/:name/:id/session - Get session info for an agent
	app.get('/agents/:name/:id/session', async (c) => {
		const agentId = c.req.param('id');
		const sessionId = c.req.query('sessionId');

		// Validate agent exists
		const agent = config.agents.get(agentId);
		if (!agent) {
			return c.json({
				success: false,
				error: `Agent not found: ${agentId}`,
			}, 404);
		}

		// Check if sessions store is available
		if (!config.sessions) {
			return c.json({
				success: false,
				error: 'Session store not configured',
			}, 503);
		}

		// If no session ID provided, return list of sessions for this agent
		if (!sessionId) {
			const allSessions = await config.sessions.list();
			const sessionList: Array<{
				sessionId: string;
				agentId?: string;
				createdAt?: number;
				messageCount?: number;
			}> = [];

			for (const sid of allSessions) {
				const data = await config.sessions.load(sid);
				if (data) {
					sessionList.push({
						sessionId: sid,
						agentId: data.metadata?.agentId as string | undefined,
						createdAt: data.createdAt,
						messageCount: data.messages.length,
					});
				}
			}

			return c.json({
				sessionId: null,
				exists: false,
				list: sessionList,
			});
		}

		// Load specific session
		const sessionData = await config.sessions.load(sessionId);

		if (!sessionData) {
			return c.json({
				sessionId,
				exists: false,
			}, 404);
		}

		// Verify session belongs to this agent
		if (sessionData.metadata?.agentId && sessionData.metadata.agentId !== agentId) {
			return c.json({
				success: false,
				error: 'Session does not belong to this agent',
			}, 403);
		}

		const response: SessionInfoResponse = {
			sessionId,
			exists: true,
			data: sessionData,
		};

		return c.json(response);
	});

	// DELETE /agents/:name/:id/session - Delete a session
	app.delete('/agents/:name/:id/session', async (c) => {
		const agentId = c.req.param('id');
		const sessionId = c.req.query('sessionId');

		// Validate agent exists
		const agent = config.agents.get(agentId);
		if (!agent) {
			return c.json({
				success: false,
				error: `Agent not found: ${agentId}`,
			}, 404);
		}

		// Check if sessions store is available
		if (!config.sessions) {
			return c.json({
				success: false,
				error: 'Session store not configured',
			}, 503);
		}

		if (!sessionId) {
			return c.json({
				success: false,
				error: 'Session ID required',
			}, 400);
		}

		const exists = await config.sessions.exists(sessionId);
		if (!exists) {
			return c.json({
				success: false,
				error: 'Session not found',
			}, 404);
		}

		await config.sessions.delete(sessionId);

		return c.json({
			success: true,
			sessionId,
		});
	});

	// =========================================================================
	// WebSocket Endpoint
	// =========================================================================

	// GET /agents/:name/:id/ws - WebSocket upgrade for real-time agent communication
	app.get('/agents/:name/:id/ws', async (c) => {
		const agentName = c.req.param('name');
		const agentId = c.req.param('id');
		const sessionId = c.req.query('sessionId');

		// Validate agent exists
		const agent = config.agents.get(agentId);
		if (!agent) {
			c.status(404);
			return c.json({
				error: `Agent not found: ${agentId}`,
			});
		}

		return c.json({
			message: 'WebSocket endpoint ready. Use WebSocket protocol to connect.',
			agentId,
			agentName,
			sessionId: sessionId ?? null,
		});
	});

	// =========================================================================
	// Hook Management Endpoints (if hooks configured)
	// =========================================================================

	if (config.hooks) {
		const hooks = config.hooks;
		// GET /hooks - List all hooks
		app.get('/hooks', async (c) => {
			const allHooks = await hooks.listHooks();
			return c.json({
				hooks: allHooks,
				count: allHooks.length,
			});
		});

		// GET /hooks/stats - Get hook statistics
		app.get('/hooks/stats', async (c) => {
			const stats = await hooks.getStats();
			return c.json(stats);
		});

		// POST /hooks/:hookId/complete - Mark hook as completed
		app.post('/hooks/:hookId/complete', async (c) => {
			const hookId = c.req.param('hookId');
			try {
				await hooks.completeWork(hookId);
				return c.json({ success: true, hookId });
			} catch (error) {
				return c.json({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				}, 400);
			}
		});

		// POST /hooks/:hookId/stall - Mark hook as stalled
		app.post('/hooks/:hookId/stall', async (c) => {
			const hookId = c.req.param('hookId');
			try {
				await hooks.stall(hookId);
				return c.json({ success: true, hookId });
			} catch (error) {
				return c.json({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				}, 400);
			}
		});
	}

	// =========================================================================
	// Bead Endpoints (if beads configured)
	// =========================================================================

	if (config.beads) {
		const beads = config.beads;
		// GET /beads - List all beads
		app.get('/beads', async (c) => {
			const status = c.req.query('status');
			const filter = status ? { status: status as 'open' | 'in_progress' | 'done' | 'blocked' } : undefined;
			const allBeads = await beads.list(filter);
			return c.json({
				beads: allBeads,
				count: allBeads.length,
			});
		});

		// GET /beads/ready - List ready beads (not blocked, not done)
		app.get('/beads/ready', async (c) => {
			const readyBeads = await beads.ready();
			return c.json({
				beads: readyBeads,
				count: readyBeads.length,
			});
		});

		// GET /beads/:id - Get specific bead
		app.get('/beads/:id', async (c) => {
			const beadId = c.req.param('id');
			const bead = await beads.get(beadId);
			if (!bead) {
				return c.json({ error: 'Bead not found' }, 404);
			}
			return c.json(bead);
		});
	}

	// =========================================================================
	// Agent Registry Endpoints
	// =========================================================================

	// GET /agents - List all registered agents
	app.get('/agents', async (c) => {
		const agents = config.agents.listRegistrations();
		return c.json({
			agents: agents.map(reg => ({
				id: reg.id,
				name: reg.name ?? reg.agent.name,
				createdAt: reg.createdAt,
				tags: reg.tags,
			})),
			count: agents.length,
		});
	});

	// =========================================================================
	// Server Lifecycle
	// =========================================================================

	/**
	 * Start the HTTP server
	 */
	async function start(port: number): Promise<void> {
		if (running) {
			throw new Error('Server is already running');
		}

		return new Promise((resolve, reject) => {
			// Handle WebSocket upgrade
			httpServerInstance.on('upgrade', (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
				const url = request.url ?? '';
				const match = url.match(/^\/agents\/([^/]+)\/([^/]+)\/ws(?:\?.*)?$/);

				if (match) {
					const agentId = match[2];
					const agent = config.agents.get(agentId);

					if (!agent) {
						socket.destroy();
						return;
					}

					// Cast to NodeJS.Socket for ws compatibility
					const wsSocket = socket as unknown as import('net').Socket;

					// Create WebSocket server for this connection
					const wss = new WebSocketServer({ noServer: true });

					wss.on('connection', (ws: WebSocket) => {
						const connectionInfo: AgentWsConnection = {
							socket: ws,
							connectedAt: Date.now(),
						};

						// Store connection
						wsConnections.set(agentId, connectionInfo);

						ws.on('message', (data: Buffer | string) => {
							try {
								const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
								console.log(`WebSocket message from ${agentId}:`, message);

								// Echo back for now (in real implementation, process with agent)
								ws.send(JSON.stringify({
									type: 'response',
									payload: {
										message: `Received: ${JSON.stringify(message)}`,
										timestamp: Date.now(),
									},
								}));
							} catch (err) {
								console.error('WebSocket message parse error:', err);
							}
						});

						ws.on('close', () => {
							wsConnections.delete(agentId);
							console.log(`WebSocket connection closed for ${agentId}`);
						});

						ws.on('error', (err: Error) => {
							console.error(`WebSocket error for ${agentId}:`, err);
							wsConnections.delete(agentId);
						});
					});

					wss.handleUpgrade(request, wsSocket, head, (ws) => {
						wss.emit('connection', ws, request);
					});
				}
			});

			// Handle incoming HTTP requests
			httpServerInstance.on('request', async (req: http.IncomingMessage, res: http.ServerResponse) => {
				try {
					// Convert Node HTTP request to Hono Request
					const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
					const headers: Record<string, string> = {};
					for (const [key, value] of Object.entries(req.headers)) {
						if (typeof value === 'string') {
							headers[key] = value;
						} else if (Array.isArray(value)) {
							headers[key] = value.join(', ');
						}
					}

					const method = req.method ?? 'GET';
					const bodyContent = await new Promise<BodyInit | null>((resolve) => {
						const chunks: Buffer[] = [];
						req.on('data', (chunk: Buffer) => chunks.push(chunk));
						req.on('end', () => {
							if (chunks.length > 0) {
								resolve(Buffer.concat(chunks));
							} else {
								resolve(null);
							}
						});
						req.on('error', () => resolve(null));
					});

					const init: RequestInit = {
						method,
						headers,
					};
					if (bodyContent) {
						init.body = bodyContent;
					}

					const request = new Request(url.toString(), init);
					const response = await app.fetch(request);

					// Convert Hono response to Node HTTP response
					res.statusCode = response.status;

					// Set headers
					response.headers.forEach((value, key) => {
						res.setHeader(key, value);
					});

					// Send body
					const text = await response.text();
					res.end(text);
				} catch (err) {
					console.error('Request handler error:', err);
					res.statusCode = 500;
					res.end('Internal Server Error');
				}
			});

			// Start listening
			httpServerInstance.listen(port, () => {
				running = true;
				listeningPort = port;
				console.log(`HTTP server listening on port ${port}`);
				resolve();
			});

			httpServerInstance.on('error', (error: Error) => {
				console.error('HTTP server error:', error);
				reject(error);
			});
		});
	}

	/**
	 * Stop the HTTP server
	 */
	async function stop(): Promise<void> {
		if (!running) {
			return;
		}

		// Close all WebSocket connections
		for (const [_agentId, conn] of wsConnections) {
			try {
				conn.socket.close(1000, 'Server shutdown');
			} catch {
				// Ignore close errors
			}
		}
		wsConnections.clear();

		// Close HTTP server
		return new Promise((resolve, reject) => {
			httpServerInstance.close((err?: Error) => {
				if (err) {
					reject(err);
				} else {
					running = false;
					listeningPort = 0;
					resolve();
				}
			});
		});
	}

	/**
	 * Check if server is running
	 */
	function isRunning(): boolean {
		return running;
	}

	/**
	 * Get the port server is listening on
	 */
	function getPort(): number {
		return listeningPort;
	}

	return {
		start,
		stop,
		app,
		httpServer: httpServerInstance,
		isRunning,
		getPort,
	};
}