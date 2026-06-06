/**
 * Node.js application entry point template.
 * This file is bundled by the Node.js build target.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Configuration
const PORT = parseInt(process.env.PORT || '3583', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Active WebSocket sessions.
 */
const activeSessions = new Map<string, WebSocket>();

/**
 * Create the HTTP application.
 */
function createApp() {
	const app = new Hono();

	// Health check
	app.get('/', (c) =>
		c.json({
			name: 'Hanumate',
			version: '0.1.0',
			status: 'running',
			target: 'node',
		})
	);

	// Agent info endpoint
	app.get('/agents/:name/:id', (c) => {
		const { name, id } = c.req.param();
		return c.json({ agent: name, instance: id });
	});

	// Agent message endpoint
	app.post('/agents/:name/:id', async (c) => {
		const { name, id } = c.req.param();
		const body = await c.req.json();
		return c.json({
			agent: name,
			instance: id,
			response: 'Message received',
			data: body,
		});
	});

	return app;
}

/**
 * Setup WebSocket handling on the HTTP server.
 */
function setupWebSocket(server: ReturnType<typeof createServer>) {
	const wss = new WebSocketServer({ noServer: true });

	server.on('upgrade', (request, socket, head) => {
		const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
		const pathname = url.pathname;

		if (pathname.startsWith('/agents/') && request.headers['upgrade']?.toLowerCase() === 'websocket') {
			const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

			if (!token || token.length === 0) {
				socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
				socket.destroy();
				return;
			}

			wss.handleUpgrade(request, socket, head, (ws) => {
				const pathParts = pathname.split('/').filter(Boolean);
				const name = pathParts[1] || 'unknown';
				const id = pathParts[2] || 'unknown';
				const sessionId = `${name}:${id}:${Date.now()}`;

				activeSessions.set(sessionId, ws);

				ws.on('message', (data: Buffer) => {
					try {
						const message = JSON.parse(data.toString());
						ws.send(
							JSON.stringify({
								type: 'response',
								sessionId,
								timestamp: new Date().toISOString(),
								data: { agent: name, instance: id, message: message.content || message },
							})
						);
					} catch (error) {
						ws.send(
							JSON.stringify({
								type: 'error',
								sessionId,
								timestamp: new Date().toISOString(),
								error: error instanceof Error ? error.message : 'Failed to parse message',
							})
						);
					}
				});

				ws.on('close', () => activeSessions.delete(sessionId));
				ws.on('error', (error) => {
					console.error(`WebSocket error for ${sessionId}:`, error);
					activeSessions.delete(sessionId);
				});

				ws.send(
					JSON.stringify({
						type: 'connected',
						sessionId,
						timestamp: new Date().toISOString(),
						data: { agent: name, instance: id, status: 'connected' },
					})
				);
			});
		} else {
			socket.destroy();
		}
	});
}

/**
 * Start the server.
 */
async function start() {
	const app = createApp();
	const server = createServer();

	setupWebSocket(server);

	console.log(`Starting Hanumate Node.js server on ${HOST}:${PORT}`);
	console.log('');
	console.log('Available endpoints:');
	console.log('  GET  /                    - Health check');
	console.log('  GET  /agents/:name/:id    - Agent info');
	console.log('  WS   /agents/:name/:id    - Agent WebSocket');
	console.log('  POST /agents/:name/:id    - Send message');
	console.log('');

	serve({
		fetch: app.fetch,
		server,
		port: PORT,
		hostname: HOST,
	});
}

// Run the application
start().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});

export { createApp, start };