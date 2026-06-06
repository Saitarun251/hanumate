/**
 * CLI Module - Duck CLI command system
 *
 * Main entry point for the duck CLI tool.
 * Provides command registration, argument parsing, and execution.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { parseArgs, findCommand } from './cli-types.js';
import type { Command, CommandRegistry, ParsedArgs, GlobalOptions, CliConfig } from './cli-types.js';

// Re-export all types
export {
	type Option,
	type Command,
	type CommandRegistry,
	type GlobalOptions,
	type ParsedArgs,
	type CommandHandler,
	type OptionType,
	type CliConfig,
	parseArgs,
	findCommand,
} from './cli-types';

// Re-export command modules
export * from './commands/index.js';

// ============================================================================
// Command Registry Implementation
// ============================================================================

/**
 * In-memory command registry for managing CLI commands
 */
export class InMemoryCommandRegistry implements CommandRegistry {
	private commands: Map<string, Command> = new Map();

	register(command: Command): void {
		this.commands.set(command.name, command);
	}

	get(name: string): Command | undefined {
		return this.commands.get(name);
	}

	list(): Command[] {
		return Array.from(this.commands.values());
	}

	async execute(name: string, args: ParsedArgs, globalOptions: GlobalOptions): Promise<boolean> {
		const command = findCommand(this, name);
		if (!command) {
			return false;
		}

		await command.handler(args, globalOptions);
		return true;
	}

	unregister(name: string): boolean {
		return this.commands.delete(name);
	}
}

// ============================================================================
// CLI Runner
// ============================================================================

/**
 * Configuration loaded from .hanumate/config.json
 */
export interface RuntimeConfig {
	/** Working directory for the CLI */
	cwd?: string;
	/** Verbose output mode */
	verbose?: boolean;
	/** Custom storage directory */
	storageDir?: string;
	/** Provider configuration */
	provider?: string;
}

/**
 * Default CLI configuration
 */
const DEFAULT_CONFIG: CliConfig = {
	name: 'duck',
	version: '0.1.0',
	bin: 'duck',
};

/**
 * Load configuration from .hanumate/config.json
 */
export function loadConfig(cwd: string = process.cwd()): RuntimeConfig {
	const configPath = resolve(cwd, '.hanumate', 'config.json');

	if (!existsSync(configPath)) {
		return {};
	}

	try {
		const content = readFileSync(configPath, 'utf-8');
		return JSON.parse(content) as RuntimeConfig;
	} catch {
		// Return empty config if file is invalid
		return {};
	}
}

/**
 * Get version from package.json
 */
export function getVersion(): string {
	try {
		const packagePath = resolve(process.cwd(), 'package.json');
		const content = readFileSync(packagePath, 'utf-8');
		const pkg = JSON.parse(content);
		return pkg.version ?? DEFAULT_CONFIG.version;
	} catch {
		return DEFAULT_CONFIG.version;
	}
}

/**
 * Print usage/help text
 */
export function printUsage(registry: CommandRegistry, config: CliConfig = DEFAULT_CONFIG): void {
	const bin = config.bin ?? 'duck';

	console.log(`${config.name} v${config.version}`);
	console.log('');
	console.log('Usage:');
	console.log(`  ${bin} <command> [options]`);
	console.log('');
	console.log('Commands:');

	const commands = registry.list();
	// Group commands by namespace
	const grouped: Record<string, Command[]> = {};
	for (const cmd of commands) {
		const parts = cmd.name.split(' ');
		const ns = parts[0];
		if (!grouped[ns]) {
			grouped[ns] = [];
		}
		grouped[ns].push(cmd);
	}

	for (const [ns, cmds] of Object.entries(grouped)) {
		console.log(`\n  ${ns}:`);
		for (const cmd of cmds) {
			const subCmd = cmd.name.split(' ').slice(1).join(' ') || '*';
			console.log(`    ${subCmd.padEnd(15)} ${cmd.description}`);
		}
	}

	console.log('');
	console.log('Global Options:');
	console.log('  --help, -h      Show this help message');
	console.log('  --version, -v   Show version information');
	console.log('  --verbose       Enable verbose output');
	console.log('  --config <path> Path to config file');
}

/**
 * Print version information
 */
export function printVersion(config: CliConfig = DEFAULT_CONFIG): void {
	const version = getVersion();
	console.log(`${config.name} v${version}`);
}

// ============================================================================
// Main Run Function
// ============================================================================

/**
 * Run the CLI with the given arguments
 * @param argv - Command line arguments (defaults to process.argv.slice(2))
 * @param config - Optional CLI configuration
 * @param registry - Optional command registry (creates new one if not provided)
 * @param commands - Optional array of commands to register
 */
export async function run(
	argv: string[] = process.argv.slice(2),
	config: CliConfig = DEFAULT_CONFIG,
	registry?: InMemoryCommandRegistry,
	commands?: Command[]
): Promise<number> {
	// Parse global options first
	const globalOptions: GlobalOptions = {
		help: false,
		version: false,
		verbose: false,
		config: undefined,
	};

	// Filter out global options
	const filteredArgv: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			globalOptions.help = true;
		} else if (arg === '--version' || arg === '-v') {
			globalOptions.version = true;
		} else if (arg === '--verbose') {
			globalOptions.verbose = true;
		} else if (arg === '--config') {
			globalOptions.config = argv[i + 1];
			i++; // Skip next arg
		} else {
			filteredArgv.push(arg);
		}
	}

	// Load runtime config
	const runtimeConfig = loadConfig();

	// Merge global verbose with runtime config
	if (runtimeConfig.verbose) {
		globalOptions.verbose = true;
	}

	// Create or use provided registry
	const cmdRegistry = registry ?? new InMemoryCommandRegistry();

	// Register commands if provided
	if (commands) {
		for (const cmd of commands) {
			cmdRegistry.register(cmd);
		}
	}

	// Handle --help
	if (globalOptions.help || filteredArgv.length === 0) {
		printUsage(cmdRegistry, config);
		return 0;
	}

	// Handle --version
	if (globalOptions.version) {
		printVersion(config);
		return 0;
	}

	// Parse remaining arguments for command
	const parsed = parseArgs(filteredArgv);

	// First arg is the command name
	const commandName = parsed.args[0];
	const commandArgs = parsed.args.slice(1);

	// Execute command
	const success = await cmdRegistry.execute(commandName, {
		args: commandArgs,
		options: parsed.options,
		command: commandName,
	}, globalOptions);

	if (!success) {
		console.error(`Error: Unknown command '${commandName}'`);
		console.error('');
		printUsage(cmdRegistry, config);
		return 1;
	}

	return 0;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Main entry point for the duck CLI
 * Called when running `duck` command directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
	// Import and register all commands
	import('./commands/index.js').then(async (commandsModule) => {
		const registry = new InMemoryCommandRegistry();
		commandsModule.registerAllCommands(registry);

		const exitCode = await run(
			process.argv.slice(2),
			{
				name: 'duck',
				version: getVersion(),
				bin: 'duck',
			},
			registry
		);

		process.exit(exitCode);
	}).catch((err) => {
		console.error('Failed to start CLI:', err);
		process.exit(1);
	});
}