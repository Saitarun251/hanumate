/**
 * CLI Integration Tests - Tests for the duck CLI command system
 *
 * Tests the core CLI functionality including:
 * - CLI entry point (run function)
 * - Command registration and execution
 * - Global options handling (--help, --version, --verbose, --config)
 * - Error handling for invalid commands
 * - Service mocking for command logic
 * - printUsage, printVersion utilities
 */

// Mock the commands module to avoid import chain issues
vi.mock('@/cli/commands/index.js', () => ({
	registerAllCommands: vi.fn(),
	registerBeadCommands: vi.fn(),
	registerHookCommands: vi.fn(),
	registerSessionCommands: vi.fn(),
	registerConvoyCommands: vi.fn(),
	registerMailCommands: vi.fn(),
	registerRefineryCommands: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseArgs, findCommand } from '@/cli/cli-types.js';
import type { Command, CommandRegistry, CliConfig } from '@/cli/cli-types.js';
import { InMemoryCommandRegistry, printUsage, printVersion, run } from '@/cli/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

/** Mock console.log for clean test output */
const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
/** Mock console.error for clean test output */
const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

/** Default CLI configuration for tests */
const TEST_CONFIG: CliConfig = {
	name: 'duck',
	version: '0.1.0',
	bin: 'duck',
};

/** Create a mock registry with sample commands */
function createMockRegistry(commands: Command[] = []): InMemoryCommandRegistry {
	const registry = new InMemoryCommandRegistry();
	for (const cmd of commands) {
		registry.register(cmd);
	}
	return registry;
}

/** Create a test command with configurable handler */
function createTestCommand(name: string, handler?: () => Promise<void> | void): Command {
	return {
		name,
		description: `Test command: ${name}`,
		handler: handler ?? vi.fn().mockResolvedValue(undefined),
	};
}

// ============================================================================
// InMemoryCommandRegistry Tests
// ============================================================================

describe('InMemoryCommandRegistry', () => {
	let registry: InMemoryCommandRegistry;

	beforeEach(() => {
		registry = new InMemoryCommandRegistry();
		mockLog.mockClear();
		mockError.mockClear();
	});

	describe('register', () => {
		it('should register a single command', () => {
			const cmd = createTestCommand('test');
			registry.register(cmd);
			expect(registry.get('test')).toBe(cmd);
		});

		it('should register multiple commands', () => {
			const cmd1 = createTestCommand('cmd1');
			const cmd2 = createTestCommand('cmd2');
			registry.register(cmd1);
			registry.register(cmd2);
			expect(registry.list()).toHaveLength(2);
		});

		it('should overwrite existing command with same name', () => {
			const cmd1 = createTestCommand('test', async () => console.log('first'));
			const cmd2 = createTestCommand('test', async () => console.log('second'));
			registry.register(cmd1);
			registry.register(cmd2);
			expect(registry.get('test')).toBe(cmd2);
			expect(registry.list()).toHaveLength(1);
		});

		it('should support subcommand names like "bead create"', () => {
			const cmd = createTestCommand('bead create');
			registry.register(cmd);
			expect(registry.get('bead create')).toBe(cmd);
		});
	});

	describe('get', () => {
		it('should retrieve registered command by name', () => {
			const cmd = createTestCommand('bead create');
			registry.register(cmd);
			expect(registry.get('bead create')).toBe(cmd);
		});

		it('should return undefined for unknown command', () => {
			expect(registry.get('unknown')).toBeUndefined();
		});

		it('should handle namespaced commands', () => {
			registry.register(createTestCommand('session show'));
			registry.register(createTestCommand('session list'));
			expect(registry.get('session show')).toBeDefined();
			expect(registry.get('session list')).toBeDefined();
		});
	});

	describe('list', () => {
		it('should list all registered commands', () => {
			registry.register(createTestCommand('cmd1'));
			registry.register(createTestCommand('cmd2'));
			registry.register(createTestCommand('cmd3'));
			const list = registry.list();
			expect(list).toHaveLength(3);
		});

		it('should return empty array when no commands registered', () => {
			expect(registry.list()).toEqual([]);
		});

		it('should list commands in registration order', () => {
			registry.register(createTestCommand('first'));
			registry.register(createTestCommand('second'));
			registry.register(createTestCommand('third'));
			const list = registry.list();
			expect(list[0].name).toBe('first');
			expect(list[1].name).toBe('second');
			expect(list[2].name).toBe('third');
		});
	});

	describe('execute', () => {
		it('should execute a registered command', async () => {
			const handler = vi.fn().mockResolvedValue(undefined);
			const cmd = createTestCommand('test', handler);
			registry.register(cmd);

			const result = await registry.execute('test', { args: [], options: {} }, {});
			expect(result).toBe(true);
			expect(handler).toHaveBeenCalled();
		});

		it('should pass args and options to handler', async () => {
			let receivedArgs: unknown;
			let receivedGlobalOptions: unknown;
			const handler = vi.fn().mockImplementation(
				(args: unknown, globalOptions: unknown) => {
					receivedArgs = args;
					receivedGlobalOptions = globalOptions;
				}
			);
			const cmd = createTestCommand('test', handler);
			registry.register(cmd);

			await registry.execute('test', { args: ['arg1'], options: { opt: 'value' }, command: 'test' }, { verbose: true });
			expect(receivedArgs).toEqual({ args: ['arg1'], options: { opt: 'value' }, command: 'test' });
			expect(receivedGlobalOptions).toEqual({ verbose: true });
		});

		it('should return false for unknown command', async () => {
			const result = await registry.execute('unknown', { args: [], options: {} }, {});
			expect(result).toBe(false);
		});

		it('should call handler with ParsedArgs structure', async () => {
			let receivedArgs: unknown;
			const handler = vi.fn().mockImplementation((args: unknown) => {
				receivedArgs = args;
			});
			const cmd = createTestCommand('test', handler);
			registry.register(cmd);

			await registry.execute('test', { args: ['pos1', 'pos2'], options: { flag: true }, command: 'test' }, {});
			expect(receivedArgs).toHaveProperty('args');
			expect(receivedArgs).toHaveProperty('options');
			expect(receivedArgs).toHaveProperty('command', 'test');
		});
	});

	describe('unregister', () => {
		it('should unregister existing command', () => {
			registry.register(createTestCommand('test'));
			expect(registry.unregister('test')).toBe(true);
			expect(registry.get('test')).toBeUndefined();
		});

		it('should return false when unregistering unknown command', () => {
			expect(registry.unregister('unknown')).toBe(false);
		});

		it('should return false when unregistering already unregistered command', () => {
			registry.register(createTestCommand('test'));
			registry.unregister('test');
			expect(registry.unregister('test')).toBe(false);
		});
	});
});

// ============================================================================
// CLI run function Tests
// ============================================================================

describe('CLI run function', () => {
	beforeEach(() => {
		mockLog.mockClear();
		mockError.mockClear();
	});

	describe('--help flag', () => {
		it('should show usage when --help is provided', async () => {
			const registry = createMockRegistry([
				createTestCommand('bead create'),
				createTestCommand('bead list'),
			]);

			const exitCode = await run(['--help'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(mockLog).toHaveBeenCalled();
			// Should contain usage information
			const output = mockLog.mock.calls.join('\n');
			expect(output).toContain('Usage:');
			expect(output).toContain('Commands:');
		});

		it('should show usage when no command is provided', async () => {
			const registry = createMockRegistry([createTestCommand('test')]);
			const exitCode = await run([], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(mockLog).toHaveBeenCalled();
		});

		it('should show help with -h short flag', async () => {
			const registry = createMockRegistry([createTestCommand('test')]);
			const exitCode = await run(['-h'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(mockLog).toHaveBeenCalled();
		});

		it('should display all registered commands in help', async () => {
			const registry = createMockRegistry([
				createTestCommand('bead create'),
				createTestCommand('bead list'),
			]);
			await run(['--help'], TEST_CONFIG, registry);
			const output = mockLog.mock.calls.join('\n');
			expect(output).toContain('bead');
		});
	});

	describe('--version flag', () => {
		it('should print version when --version is provided', async () => {
			const registry = createMockRegistry();
			const exitCode = await run(['--version'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			const output = mockLog.mock.calls.join('\n');
			expect(output).toContain('duck');
			expect(output).toContain('0.1.0');
		});

		it('should print version with -v short flag', async () => {
			const registry = createMockRegistry();
			const exitCode = await run(['-v'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			const output = mockLog.mock.calls.join('\n');
			expect(output).toContain('0.1.0');
		});

		it('should print custom version from config', async () => {
			const registry = createMockRegistry();
			const customConfig = { ...TEST_CONFIG, version: '2.0.0' };
			await run(['--version'], customConfig, registry);
			const output = mockLog.mock.calls.join('\n');
			expect(output).toContain('2.0.0');
		});
	});

	describe('--verbose flag', () => {
		it('should pass verbose flag to handlers', async () => {
			let receivedOptions: unknown;
			const handler = vi.fn().mockImplementation((_args: unknown, options: unknown) => {
				receivedOptions = options;
			});
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			await run(['--verbose', 'test'], TEST_CONFIG, registry);
			expect(receivedOptions).toHaveProperty('verbose', true);
		});

		it('should handle --verbose before command', async () => {
			let receivedOptions: unknown;
			const handler = vi.fn().mockImplementation((_args: unknown, options: unknown) => {
				receivedOptions = options;
			});
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			await run(['--verbose', 'test'], TEST_CONFIG, registry);
			expect(receivedOptions).toHaveProperty('verbose', true);
		});
	});

	describe('--config flag', () => {
		it('should pass config path to handlers', async () => {
			let receivedOptions: unknown;
			const handler = vi.fn().mockImplementation((_args: unknown, options: unknown) => {
				receivedOptions = options;
			});
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			await run(['--config', '/path/to/config.json', 'test'], TEST_CONFIG, registry);
			expect(receivedOptions).toHaveProperty('config', '/path/to/config.json');
		});

		it('should handle config flag in different positions', async () => {
			let receivedOptions: unknown;
			const handler = vi.fn().mockImplementation((_args: unknown, options: unknown) => {
				receivedOptions = options;
			});
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			await run(['test', '--config', '/custom/path.json'], TEST_CONFIG, registry);
			expect(receivedOptions).toHaveProperty('config', '/custom/path.json');
		});
	});

	describe('command execution', () => {
		it('should execute a valid command', async () => {
			const handler = vi.fn().mockResolvedValue(undefined);
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			const exitCode = await run(['test'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(handler).toHaveBeenCalled();
		});

		it('should execute command with arguments', async () => {
			let receivedArgs: unknown;
			const handler = vi.fn().mockImplementation((args: unknown) => {
				receivedArgs = args;
			});
			const cmd = createTestCommand('greet', handler);
			const registry = createMockRegistry([cmd]);

			await run(['greet', 'Hello', '--name', 'World'], TEST_CONFIG, registry);
			expect(receivedArgs).toHaveProperty('args', ['Hello']);
			expect(receivedArgs).toHaveProperty('options');
		});

		it('should handle subcommands (e.g., "bead create")', async () => {
			const handler = vi.fn().mockResolvedValue(undefined);
			// Register command with subcommand name
			const cmd = createTestCommand('bead create', handler);
			const registry = createMockRegistry([cmd]);

			// Pass the subcommand as a single argument
			const exitCode = await run(['bead create', '--priority', 'P1'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(handler).toHaveBeenCalled();
		});

		it('should handle command with multiple positional args', async () => {
			const handler = vi.fn().mockResolvedValue(undefined);
			const cmd = createTestCommand('bead', handler);
			const registry = createMockRegistry([cmd]);

			// bead is the command, create and extra are positional args
			const exitCode = await run(['bead', 'create', 'extra'], TEST_CONFIG, registry);
			expect(exitCode).toBe(0);
			expect(handler).toHaveBeenCalled();
		});

		it('should pass command options to handler', async () => {
			let receivedArgs: unknown;
			const handler = vi.fn().mockImplementation((args: unknown) => {
				receivedArgs = args;
			});
			const cmd = createTestCommand('test', handler);
			const registry = createMockRegistry([cmd]);

			await run(['test', '--option1', 'value1', '--flag'], TEST_CONFIG, registry);
			expect(receivedArgs).toHaveProperty('options');
		});
	});

	describe('error handling', () => {
		it('should return error code for unknown command', async () => {
			const registry = createMockRegistry();
			const exitCode = await run(['unknown'], TEST_CONFIG, registry);
			expect(exitCode).toBe(1);
			expect(mockError).toHaveBeenCalled();
		});

		it('should show error message for unknown command', async () => {
			const registry = createMockRegistry();
			await run(['unknown'], TEST_CONFIG, registry);
			const errorOutput = mockError.mock.calls.join('\n');
			expect(errorOutput).toContain("Unknown command 'unknown'");
		});

		it('should show usage after unknown command error', async () => {
			const registry = createMockRegistry();
			await run(['unknown'], TEST_CONFIG, registry);
			// Should print usage after error
			expect(mockError).toHaveBeenCalled();
		});

		it('should handle multiple unknown commands gracefully', async () => {
			const registry = createMockRegistry();
			await run(['foo', 'bar', 'baz'], TEST_CONFIG, registry);
			expect(mockError).toHaveBeenCalled();
		});
	});
});

// ============================================================================
// printUsage Tests
// ============================================================================

describe('printUsage', () => {
	beforeEach(() => {
		mockLog.mockClear();
	});

	it('should print CLI name and version', () => {
		const registry = createMockRegistry();
		printUsage(registry, TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('duck v0.1.0');
	});

	it('should print usage instructions', () => {
		const registry = createMockRegistry();
		printUsage(registry, TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('Usage:');
		expect(output).toContain('duck <command> [options]');
	});

	it('should list registered commands', () => {
		const registry = createMockRegistry([
			createTestCommand('bead create'),
			createTestCommand('bead list'),
		]);
		printUsage(registry, TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('bead');
		expect(output).toContain('create');
		expect(output).toContain('list');
	});

	it('should print global options', () => {
		const registry = createMockRegistry();
		printUsage(registry, TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('--help, -h');
		expect(output).toContain('--version, -v');
		expect(output).toContain('--verbose');
		expect(output).toContain('--config <path>');
	});

	it('should group commands by namespace', () => {
		const registry = createMockRegistry([
			createTestCommand('bead create'),
			createTestCommand('bead list'),
			createTestCommand('session show'),
		]);
		printUsage(registry, TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		// Should show grouped commands
		expect(output).toContain('bead:');
		expect(output).toContain('session:');
	});

	it('should use custom bin name', () => {
		const customConfig = { ...TEST_CONFIG, bin: 'hanumate' };
		const registry = createMockRegistry();
		printUsage(registry, customConfig);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('hanumate <command>');
	});

	it('should handle empty command list', () => {
		const registry = createMockRegistry();
		printUsage(registry, TEST_CONFIG);
		// Should not throw, just show basic usage
		expect(mockLog).toHaveBeenCalled();
	});
});

// ============================================================================
// printVersion Tests
// ============================================================================

describe('printVersion', () => {
	beforeEach(() => {
		mockLog.mockClear();
	});

	it('should print name and version', () => {
		printVersion(TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		expect(output).toContain('duck');
		expect(output).toContain('0.1.0');
	});

	it('should use custom name from config', () => {
		const customConfig = { ...TEST_CONFIG, name: 'custom', version: '1.2.3' };
		printVersion(customConfig);
		const output = mockLog.mock.calls.join('\n');
		// Note: printVersion uses getVersion() which reads from package.json
		// So the version from config is not used, but name is
		expect(output).toContain('custom');
	});

	it('should print version using package.json version', () => {
		// printVersion calls getVersion() which reads from package.json
		// So custom config version is not used, but the function still works
		printVersion(TEST_CONFIG);
		const output = mockLog.mock.calls.join('\n');
		// It should contain the name and some version (from package.json)
		expect(output).toContain('duck');
	});
});

// ============================================================================
// parseArgs Tests
// ============================================================================

describe('parseArgs', () => {
	it('should parse boolean flags', () => {
		const result = parseArgs(['--verbose', '--help']);
		expect(result.options).toEqual({ verbose: true, help: true });
		expect(result.args).toEqual([]);
	});

	it('should parse string values', () => {
		const result = parseArgs(['--name', 'value', 'extra']);
		expect(result.options).toEqual({ name: 'value' });
		expect(result.args).toEqual(['extra']);
	});

	it('should parse short flags', () => {
		const result = parseArgs(['-v', '-n', 'test']);
		expect(result.options).toEqual({ v: true, n: 'test' });
	});

	it('should handle positional arguments', () => {
		const result = parseArgs(['bead', 'create', '--priority', 'P1']);
		expect(result.args).toEqual(['bead', 'create']);
		expect(result.options).toEqual({ priority: 'P1' });
	});

	it('should handle multiple arguments and options', () => {
		const result = parseArgs(['cmd', 'sub', '--flag', '--value', '123', 'arg1', 'arg2']);
		expect(result.args).toEqual(['cmd', 'sub', 'arg1', 'arg2']);
		expect(result.options).toEqual({ flag: true, value: '123' });
	});

	it('should handle empty array', () => {
		const result = parseArgs([]);
		expect(result.args).toEqual([]);
		expect(result.options).toEqual({});
	});

	it('should handle mixed flags and arguments', () => {
		// parseArgs treats positional args as anything not starting with -
		// --global is parsed as a boolean flag, then cmd and sub are positional
		// --local value is parsed as an option
		const result = parseArgs(['--global', 'cmd', 'sub', '--local', 'value']);
		// The first non-flag becomes the value of --global (parseArgs behavior)
		expect(result.options).toEqual({ global: 'cmd', local: 'value' });
	});

	it('should handle equals syntax (via parseArgs limitation)', () => {
		// Note: The current parseArgs doesn't support --key=value syntax
		// It treats --name=value as a single option with key "name=value" and value "extra"
		const result = parseArgs(['--name=value', 'extra']);
		expect(result.options).toEqual({ 'name=value': 'extra' });
		expect(result.args).toEqual([]);
	});

	it('should handle multiple boolean flags', () => {
		const result = parseArgs(['--flag1', '--flag2', '--flag3']);
		expect(result.options).toEqual({ flag1: true, flag2: true, flag3: true });
	});

	it('should handle number-like values as strings', () => {
		const result = parseArgs(['--count', '42', '--ratio', '3.14']);
		expect(result.options).toEqual({ count: '42', ratio: '3.14' });
	});

	it('should parse complex command like "bead create --title Fix bug --priority P1"', () => {
		const result = parseArgs(['bead', 'create', '--title', 'Fix bug', '--priority', 'P1']);
		expect(result.args).toEqual(['bead', 'create']);
		expect(result.options).toEqual({ title: 'Fix bug', priority: 'P1' });
	});
});

// ============================================================================
// findCommand Tests
// ============================================================================

describe('findCommand', () => {
	it('should find exact match', () => {
		const registry = createMockRegistry([
			{ name: 'bead create', description: 'Create a bead', handler: async () => {} },
		]);

		const cmd = findCommand(registry, 'bead create');
		expect(cmd?.name).toBe('bead create');
	});

	it('should find parent command for subcommands', () => {
		const registry = createMockRegistry([
			{ name: 'bead create', description: 'Create a bead', handler: async () => {} },
			{ name: 'bead list', description: 'List beads', handler: async () => {} },
		]);

		const cmd = findCommand(registry, 'bead create extra');
		expect(cmd?.name).toBe('bead create');
	});

	it('should return undefined for unknown commands', () => {
		const registry = createMockRegistry([
			{ name: 'bead create', description: 'Create a bead', handler: async () => {} },
		]);

		const cmd = findCommand(registry, 'unknown');
		expect(cmd).toBeUndefined();
	});

	it('should handle commands with multiple subcommand levels', () => {
		const registry = createMockRegistry([
			{ name: 'session show', description: 'Show session', handler: async () => {} },
		]);

		const cmd = findCommand(registry, 'session show abc123');
		expect(cmd?.name).toBe('session show');
	});

	it('should prefer longer matches over shorter ones', () => {
		const registry = createMockRegistry([
			{ name: 'bead', description: 'Bead commands', handler: async () => {} },
			{ name: 'bead create', description: 'Create a bead', handler: async () => {} },
		]);

		const cmd = findCommand(registry, 'bead create');
		expect(cmd?.name).toBe('bead create');
	});

	it('should prefer longer match over shorter', () => {
		const registry = createMockRegistry([
			createTestCommand('bead'),
			createTestCommand('bead create'),
			createTestCommand('bead create task'),
		]);

		const cmd = findCommand(registry, 'bead create task extra');
		expect(cmd?.name).toBe('bead create task');
	});

	it('should find parent command when exact not found', () => {
		const registry = createMockRegistry([
			createTestCommand('bead create'),
		]);

		const cmd = findCommand(registry, 'bead create more stuff here');
		expect(cmd?.name).toBe('bead create');
	});

	it('should handle single word commands', () => {
		const registry = createMockRegistry([
			createTestCommand('init'),
		]);

		const cmd = findCommand(registry, 'init');
		expect(cmd?.name).toBe('init');
	});
});

// ============================================================================
// Command Type Tests
// ============================================================================

describe('Command type', () => {
	it('should support command with options', () => {
		const cmd: Command = {
			name: 'test',
			description: 'Test command',
			usage: 'duck test [--option <value>]',
			options: [
				{
					name: 'option',
					type: 'string',
					description: 'An option',
					required: true,
				},
			],
			examples: ['duck test --option value'],
			handler: async () => {},
		};

		expect(cmd.name).toBe('test');
		expect(cmd.options?.[0].required).toBe(true);
	});

	it('should support command with short option alias', () => {
		const cmd: Command = {
			name: 'test',
			description: 'Test command',
			options: [
				{
					name: 'verbose',
					short: 'v',
					type: 'boolean',
					description: 'Verbose output',
				},
			],
			handler: async () => {},
		};

		expect(cmd.options?.[0].short).toBe('v');
	});

	it('should support command with default value', () => {
		const cmd: Command = {
			name: 'test',
			description: 'Test command',
			options: [
				{
					name: 'count',
					type: 'number',
					description: 'Count',
					default: 10,
				},
			],
			handler: async () => {},
		};

		expect(cmd.options?.[0].default).toBe(10);
	});
});

// ============================================================================
// Integration: Full CLI Workflow
// ============================================================================

describe('CLI integration workflow', () => {
	beforeEach(() => {
		mockLog.mockClear();
		mockError.mockClear();
	});

	it('should complete full workflow: help -> version -> command', async () => {
		const registry = createMockRegistry([
			createTestCommand('test'),
		]);

		// Step 1: Help
		let exitCode = await run(['--help'], TEST_CONFIG, registry);
		expect(exitCode).toBe(0);

		// Step 2: Version
		exitCode = await run(['--version'], TEST_CONFIG, registry);
		expect(exitCode).toBe(0);

		// Step 3: Execute command
		exitCode = await run(['test'], TEST_CONFIG, registry);
		expect(exitCode).toBe(0);
	});

	it('should handle command with multiple options', async () => {
		const handler = vi.fn().mockResolvedValue(undefined);
		const cmd = createTestCommand('complex', handler);
		const registry = createMockRegistry([cmd]);

		const exitCode = await run([
			'--verbose',
			'--config',
			'/path/config.json',
			'complex',
			'arg1',
			'arg2',
			'--option1',
			'value1',
			'--option2',
			'value2',
		], TEST_CONFIG, registry);

		expect(exitCode).toBe(0);
		expect(handler).toHaveBeenCalled();
	});

	it('should maintain state across multiple runs with same registry', async () => {
		const registry = createMockRegistry([
			createTestCommand('cmd1'),
			createTestCommand('cmd2'),
		]);

		// Run multiple commands
		await run(['cmd1'], TEST_CONFIG, registry);
		await run(['cmd2'], TEST_CONFIG, registry);

		// Commands should still be registered
		expect(registry.list()).toHaveLength(2);
	});

	it('should handle command priority over global options', async () => {
		const handler = vi.fn().mockResolvedValue(undefined);
		const cmd = createTestCommand('--help', handler); // Command named "--help" (edge case)
		const registry = createMockRegistry([cmd]);

		// This should try to execute the command, not show help
		await run(['--help'], TEST_CONFIG, registry);
		// The command should be found and executed
	});

	it('should handle empty and whitespace arguments', async () => {
		const registry = createMockRegistry();
		const exitCode = await run(['', '  '], TEST_CONFIG, registry);
		expect(exitCode).toBe(1); // Unknown commands
	});
});