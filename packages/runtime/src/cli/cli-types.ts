/**
 * CLI Types - Type definitions for the duck CLI command system
 *
 * Provides a framework for registering and executing CLI commands
 * with support for options, help text, and global flags.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Option value types
 */
export type OptionType = 'string' | 'number' | 'boolean' | 'array';

/**
 * CLI Option definition
 */
export interface Option {
	/** Full option name (e.g., --config) */
	name: string;
	/** Short alias (e.g., -c) */
	short?: string;
	/** Data type of the option value */
	type: OptionType;
	/** Description shown in help text */
	description: string;
	/** Whether the option is required */
	required?: boolean;
	/** Default value if not provided */
	default?: unknown;
}

/**
 * Global CLI options available to all commands
 */
export interface GlobalOptions {
	/** Show help information */
	help?: boolean;
	/** Show version information */
	version?: boolean;
	/** Enable verbose output */
	verbose?: boolean;
	/** Path to config file */
	config?: string;
}

/**
 * Parsed command arguments
 */
export interface ParsedArgs {
	/** Positional arguments */
	args: string[];
	/** Parsed options */
	options: Record<string, unknown>;
	/** The command name that was invoked */
	command?: string;
}

/**
 * Command handler function type
 */
export type CommandHandler = (
	args: ParsedArgs,
	globalOptions: GlobalOptions
) => Promise<void> | void;

/**
 * Command definition
 */
export interface Command {
	/** Command name (e.g., 'init', 'bead create') */
	name: string;
	/** Short description of what the command does */
	description: string;
	/** Usage string (e.g., 'duck init <project-name>') */
	usage?: string;
	/** Array of options accepted by this command */
	options?: Option[];
	/** Additional examples shown in help */
	examples?: string[];
	/** Handler function called when command is executed */
	handler: CommandHandler;
}

// ============================================================================
// Command Registry
// ============================================================================

/**
 * Command registry interface for managing CLI commands
 */
export interface CommandRegistry {
	/**
	 * Register a new command
	 * @param command - Command to register
	 */
	register(command: Command): void;

	/**
	 * Get a command by name
	 * @param name - Command name to find
	 * @returns Command or undefined if not found
	 */
	get(name: string): Command | undefined;

	/**
	 * List all registered commands
	 * @returns Array of all registered commands
	 */
	list(): Command[];

	/**
	 * Execute a command by name
	 * @param name - Command name to execute
	 * @param args - Parsed command arguments
	 * @param globalOptions - Global CLI options
	 * @returns Promise resolving to true if executed, false if not found
	 */
	execute(name: string, args: ParsedArgs, globalOptions: GlobalOptions): Promise<boolean>;

	/**
	 * Unregister a command
	 * @param name - Command name to remove
	 * @returns true if command was removed
	 */
	unregister(name: string): boolean;
}

/**
 * CLI configuration
 */
export interface CliConfig {
	/** Name of the CLI tool */
	name: string;
	/** Version string */
	version: string;
	/** Bin name for help text */
	bin?: string;
	/** Default global options */
	defaultOptions?: Partial<GlobalOptions>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse command line arguments into structured format
 * @param argv - Raw argument array (e.g., process.argv)
 * @returns Parsed arguments object
 */
export function parseArgs(argv: string[]): ParsedArgs {
	const args: string[] = [];
	const options: Record<string, unknown> = {};

	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];

		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const next = argv[i + 1];

			// Check if next arg is a value (not another flag)
			if (next !== undefined && !next.startsWith('-')) {
				options[key] = next;
				i += 2;
			} else {
				options[key] = true;
				i++;
			}
		} else if (arg.startsWith('-')) {
			const key = arg.slice(1);
			const next = argv[i + 1];

			if (next !== undefined && !next.startsWith('-')) {
				options[key] = next;
				i += 2;
			} else {
				options[key] = true;
				i++;
			}
		} else {
			args.push(arg);
			i++;
		}
	}

	return { args, options };
}

/**
 * Find a command by name (supports subcommands like 'bead create')
 * @param registry - Command registry to search
 * @param name - Command name (may include subcommand)
 * @returns Found command or undefined
 */
export function findCommand(
	registry: CommandRegistry,
	name: string
): Command | undefined {
	// Try exact match first
	let command = registry.get(name);
	if (command) return command;

	// Try progressively shorter command names (e.g., 'bead create extra' -> 'bead create' -> 'bead')
	const parts = name.split(' ');
	for (let i = parts.length - 1; i > 0; i--) {
		const prefix = parts.slice(0, i).join(' ');
		command = registry.get(prefix);
		if (command) return command;
	}

	return undefined;
}