import { parseArgs } from 'util';
import { serve } from '@hono/node-server';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { executeWorkflow, parsePayload } from './utils/workflow-loader.js';
import { createApp } from './commands/dev.js';

const COMMANDS = {
	dev: 'Start development server',
	run: 'Run a workflow from CLI',
	build: 'Build for production',
	connect: 'Connect to an agent instance',
	help: 'Show help',
} as const;

type Command = keyof typeof COMMANDS;

export async function main() {
	const args = parseArgs({
		args: process.argv.slice(2),
		options: {
			target: { type: 'string', default: 'node' },
			port: { type: 'string', default: '3583' },
			payload: { type: 'string', default: '{}' },
			help: { type: 'boolean', default: false },
		},
		allowPositionals: true,
	});

	const [command, ...positional] = args.positionals;

	if (!command || args.values.help) {
		printHelp();
		return;
	}

	switch (command as Command) {
		case 'dev':
			await runDev(args.values);
			break;
		case 'run':
			await runWorkflow(positional[0], args.values);
			break;
		case 'build':
			await runBuildCmd(args.values);
			break;
		case 'connect':
			await runConnect(positional[0], positional[1], args.values);
			break;
		default:
			console.error('Unknown command: ' + command);
			printHelp();
			process.exit(1);
	}
}

function printHelp() {
	console.log('RubberDuck CLI v0.1.0');
	console.log('');
	console.log('Usage: duck <command> [options]');
	console.log('');
	console.log('Commands:');
	console.log('  dev       Start development server (default port: 3583)');
	console.log('  run       Run a workflow from CLI');
	console.log('  build     Build for production');
	console.log('  connect   Connect to an agent instance');
	console.log('  help      Show this help message');
	console.log('');
	console.log('Options:');
	console.log('  --target <node|cloudflare>  Target platform (default: node)');
	console.log('  --port <number>             Port for dev server (default: 3583)');
	console.log('  --payload <json>            JSON payload for workflow (default: {})');
	console.log('  --help                      Show help');
	console.log('');
	console.log('Examples:');
	console.log('  duck run my-workflow');
	console.log('  duck run my-workflow --payload \'{"key": "value"}\'');
	console.log('  duck dev --port 3000');
}

/**
 * Active WebSocket sessions for persistent agent connections.
 */
const activeSessions = new Map<string, WebSocket>();

/**
 * Send a message to a specific session.
 */
export function sendToSession(sessionId: string, message: object): boolean {
	const ws = activeSessions.get(sessionId);
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
		return true;
	}
	return false;
}

/**
 * Broadcast a message to all active sessions.
 */
export function broadcast(message: object) {
	for (const [sessionId, ws] of activeSessions) {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		} else {
			// Clean up dead sessions
			activeSessions.delete(sessionId);
		}
	}
}

/**
 * Get all active session IDs.
 */
export function getActiveSessions(): string[] {
	return Array.from(activeSessions.keys());
}

async function runDev(options: { target?: string; port?: string }) {
	const port = parseInt(options.port ?? '3583', 10);

	// Create HTTP server
	const server = createServer();

	// Create WebSocket server with noServer mode
	const wss = new WebSocketServer({ noServer: true });

	// Handle WebSocket upgrade requests
	server.on('upgrade', (request, socket, head) => {
		const url = new URL(request.url || '/', `http://localhost:${port}`);
		const pathname = url.pathname;

		// Only upgrade WebSocket connections for /agents/:name/:id routes
		if (pathname.startsWith('/agents/') && request.headers['upgrade']?.toLowerCase() === 'websocket') {
			// Parse token from query string or headers
			const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');
			
			// Authenticate - require non-empty token
			if (!token || token.length === 0) {
				socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
				socket.destroy();
				return;
			}

			wss.handleUpgrade(request, socket, head, (ws) => {
				// Parse agent name and id from path
				const pathParts = pathname.split('/').filter(Boolean);
				const name = pathParts[1] || 'unknown';
				const id = pathParts[2] || 'unknown';
				const sessionId = `${name}:${id}:${Date.now()}`;

				// Store the session
				activeSessions.set(sessionId, ws);

				console.log(`WebSocket connected: ${sessionId}`);

				// Handle incoming messages
				ws.on('message', (data: Buffer) => {
					try {
						const message = JSON.parse(data.toString());
						console.log(`Received message for ${sessionId}:`, message);

						// Process the message through the agent
						const response = {
							type: 'response',
							sessionId,
							timestamp: new Date().toISOString(),
							data: {
								agent: name,
								instance: id,
								message: message.content || message,
							},
						};

						// Send response back to client
						ws.send(JSON.stringify(response));
					} catch (error) {
						const errorResponse = {
							type: 'error',
							sessionId,
							timestamp: new Date().toISOString(),
							error: error instanceof Error ? error.message : 'Failed to parse message',
						};
						ws.send(JSON.stringify(errorResponse));
					}
				});

				// Handle connection close
				ws.on('close', () => {
					activeSessions.delete(sessionId);
					console.log(`WebSocket disconnected: ${sessionId}`);
				});

				// Handle errors
				ws.on('error', (error) => {
					console.error(`WebSocket error for ${sessionId}:`, error);
					activeSessions.delete(sessionId);
				});

				// Send connection acknowledgment
				const ackMessage = {
					type: 'connected',
					sessionId,
					timestamp: new Date().toISOString(),
					data: {
						agent: name,
						instance: id,
						status: 'connected',
					},
				};
				ws.send(JSON.stringify(ackMessage));
			});
		} else {
			socket.destroy();
		}
	});

	const app = createApp();

	console.log('Starting RubberDuck dev server on port ' + port);
	console.log('Target: ' + (options.target ?? 'node'));
	console.log('');
	console.log('Available endpoints:');
	console.log('  GET  /                    - Health check');
	console.log('  GET  /agents/:name/:id    - Agent info (HTTP)');
	console.log('  WS   /agents/:name/:id    - Agent WebSocket connection');
	console.log('  POST /agents/:name/:id    - Send message to agent (HTTP)');
	console.log('  GET  /workflows/:name     - Workflow info');
	console.log('  POST /workflows/:name     - Execute workflow');
	console.log('');
	console.log('WebSocket endpoint: ws://localhost:' + port + '/agents/:name/:id?token=<your-token>');
	console.log('');
	console.log(`Server running at http://localhost:${port}`);

	// Serve HTTP with Hono and WebSocket upgrade support
	serve({
		fetch: app.fetch,
		server,
		port,
	});
}

async function runWorkflow(name: string | undefined, options: Record<string, unknown>) {
	if (!name) {
		console.error('Workflow name required: duck run <workflow-name>');
		process.exit(1);
	}

	// Parse and validate JSON payload from --payload argument
	let payload: Record<string, unknown> = {};
	const payloadArg = options.payload as string;

	try {
		payload = parsePayload(payloadArg);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('Error:', errorMessage);
		console.error('Usage: duck run <workflow-name> --payload \'{"key": "value"}\'');
		process.exit(1);
	}

	console.log('Running workflow: ' + name);

	const result = await executeWorkflow(name, payload);

	if (!result.success) {
		console.error('Workflow failed:', result.error);
		if (result.errorType) {
			console.error('Error type:', result.errorType);
		}
		process.exit(1);
	}

	// Print the workflow result as formatted JSON
	console.log('\nWorkflow result:');
	console.log(JSON.stringify(result.data, null, 2));
}

async function runBuildCmd(options: { target?: string }) {
	try {
		const { runBuild } = await import('./build/index.js');
		await runBuild({ target: options.target });
	} catch (error) {
		process.exit(1);
	}
}

async function runConnect(agentName: string | undefined, agentId: string | undefined, _options: Record<string, unknown>) {
	if (!agentName || !agentId) {
		console.error('Usage: duck connect <agent-name> <agent-id>');
		process.exit(1);
	}
	console.log('Connecting to agent: ' + agentName + '/' + agentId);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});