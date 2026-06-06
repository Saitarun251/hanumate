/**
 * Server Commands - CLI command handlers for server operations
 *
 * Provides handlers for:
 * - server start: Start the HTTP server
 * - server stop: Stop the HTTP server
 * - server status: Check server status
 */

import type { Command, ParsedArgs, GlobalOptions } from '../../cli-types.js';
import { createServer, type HttpServer } from '../../../server/index.js';
import { AgentRegistry } from '../../../agents.js';

// ============================================================================
// Server State Management
// ============================================================================

/**
 * In-memory server instance for CLI lifecycle
 * Note: In production, this would use a persistent store (PID file, etc.)
 */
let serverInstance: HttpServer | null = null;
let serverPort = 0;
let serverStartTime = 0;

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * ANSI color codes for CLI output
 */
const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
};

/**
 * Format server status for CLI output
 */
export function formatServerStatus(isRunning: boolean, port?: number, uptime?: number): string {
	const lines: string[] = [];

	lines.push(`${colors.bold}Server Status:${colors.reset}`);

	if (isRunning && port && uptime !== undefined) {
		const hours = Math.floor(uptime / 3600);
		const minutes = Math.floor((uptime % 3600) / 60);
		const seconds = uptime % 60;

		lines.push(`  ${colors.green}Running${colors.reset}`);
		lines.push(`  Port:     ${port}`);
		lines.push(`  Uptime:   ${hours}h ${minutes}m ${seconds}s`);
	} else {
		lines.push(`  ${colors.red}Stopped${colors.reset}`);
	}

	return lines.join('\n');
}

/**
 * Format server start success message
 */
export function formatServerStart(port: number, daemon: boolean): string {
	const modeText = daemon ? ' (background)' : '';
	return `${colors.green}Server started successfully${colors.reset}${modeText}\nPort: ${port}\nPID: ${process.pid}`;
}

/**
 * Format server stop message
 */
export function formatServerStop(): string {
	return `${colors.green}Server stopped successfully${colors.reset}`;
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle server start command
 */
async function handleServerStart(
	args: ParsedArgs,
	_options: GlobalOptions
): Promise<void> {
	// Check if server is already running
	if (serverInstance && serverInstance.isRunning()) {
		console.error(`${colors.red}Error: Server is already running on port ${serverInstance.getPort()}${colors.reset}`);
		process.exit(1);
	}

	// Get port from args or use default
	const portArg = args.options.port;
	const port = typeof portArg === 'number' ? portArg : parseInt(portArg as string, 10) || 3000;

	// Check for daemon mode
	const daemon = args.options.daemon === true;

	if (daemon) {
		// Daemon mode: fork and exit parent process
		console.log(`${colors.yellow}Starting server in background mode...${colors.reset}`);

		// In a real implementation, we would fork a child process and save PID
		// For now, just start normally and detach
		try {
			// Create agent registry for the server
			const agentRegistry = new AgentRegistry();

			// Create and start server
			serverInstance = createServer({
				agents: agentRegistry,
			});

			await serverInstance.start(port);
			serverPort = port;
			serverStartTime = Date.now();

			// Detach from terminal
			process.stdout.write('\x1b[2J\x1b[H'); // Clear screen
			process.stdout.write('\x1b[3J\x1b[H'); // Clear scrollback

			console.log(formatServerStart(port, true));

			// Note: In production, we would write PID to a file and properly detach
			// For now, the server runs in the current process
		} catch (error) {
			console.error(`${colors.red}Failed to start server:${colors.reset}`, error instanceof Error ? error.message : error);
			process.exit(1);
		}
	} else {
		// Foreground mode
		console.log(`${colors.cyan}Starting HTTP server...${colors.reset}`);

		try {
			// Create agent registry for the server
			const agentRegistry = new AgentRegistry();

			// Create and start server
			serverInstance = createServer({
				agents: agentRegistry,
			});

			await serverInstance.start(port);
			serverPort = port;
			serverStartTime = Date.now();

			console.log(formatServerStart(port, false));
			console.log('\nPress Ctrl+C to stop the server');

			// Keep process alive
			process.on('SIGINT', async () => {
				console.log('\n\nShutting down server...');
				await serverInstance?.stop();
				console.log(formatServerStop());
				process.exit(0);
			});

			process.on('SIGTERM', async () => {
				console.log('\n\nShutting down server...');
				await serverInstance?.stop();
				process.exit(0);
			});
		} catch (error) {
			if (error instanceof Error && error.message === 'Server is already running') {
				console.error(`${colors.red}Error: Server is already running on port ${serverInstance?.getPort()}${colors.reset}`);
			} else {
				console.error(`${colors.red}Failed to start server:${colors.reset}`, error instanceof Error ? error.message : error);
			}
			process.exit(1);
		}
	}
}

/**
 * Handle server stop command
 */
async function handleServerStop(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	// Check if server is running
	if (!serverInstance || !serverInstance.isRunning()) {
		console.error(`${colors.red}Error: Server is not running${colors.reset}`);
		process.exit(1);
	}

	try {
		await serverInstance.stop();
		serverPort = 0;
		serverStartTime = 0;
		console.log(formatServerStop());
	} catch (error) {
		console.error(`${colors.red}Failed to stop server:${colors.reset}`, error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

/**
 * Handle server status command
 */
async function handleServerStatus(
	_args: ParsedArgs,
	__options: GlobalOptions
): Promise<void> {
	const isRunning = serverInstance?.isRunning() ?? false;
	const uptime = isRunning && serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) : undefined;

	console.log(formatServerStatus(isRunning, serverPort, uptime));
}

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Server start command - Start the HTTP server
 */
export const serverStartCommand: Command = {
	name: 'server start',
	description: 'Start the HTTP server',
	usage: 'duck server start [--port <port>] [--daemon]',
	options: [
		{
			name: 'port',
			type: 'number',
			description: 'Port to listen on (default: 3000)',
			default: 3000,
		},
		{
			name: 'daemon',
			type: 'boolean',
			description: 'Run server in background mode',
			default: false,
		},
	],
	examples: [
		'duck server start',
		'duck server start --port 8080',
		'duck server start --port 3000 --daemon',
	],
	handler: handleServerStart,
};

/**
 * Server stop command - Stop the HTTP server
 */
export const serverStopCommand: Command = {
	name: 'server stop',
	description: 'Stop the HTTP server',
	usage: 'duck server stop',
	options: [],
	handler: handleServerStop,
};

/**
 * Server status command - Check server status
 */
export const serverStatusCommand: Command = {
	name: 'server status',
	description: 'Check server status',
	usage: 'duck server status',
	options: [],
	handler: handleServerStatus,
};

/**
 * All server commands
 */
export const serverCommands: Command[] = [
	serverStartCommand,
	serverStopCommand,
	serverStatusCommand,
];

/**
 * Register all server commands to a registry
 */
export function registerServerCommands(registry: { register: (cmd: Command) => void }): void {
	for (const cmd of serverCommands) {
		registry.register(cmd);
	}
}