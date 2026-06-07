/**
 * CLI Tests - Tests for the hanumate CLI types module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseArgs, findCommand } from '@/cli/cli-types.js';
import type { Command, CommandRegistry } from '@/cli/cli-types.js';

// Mock console.log for clean test output
const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

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
});

describe('findCommand', () => {
	// Simple mock registry for testing
	const createMockRegistry = (commands: Command[]): CommandRegistry => {
		const map = new Map(commands.map((c) => [c.name, c]));
		return {
			get: (name: string) => map.get(name),
			list: () => commands,
			register: () => {},
			execute: async () => false,
			unregister: () => false,
		};
	};

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
});

describe('Command type', () => {
	it('should support command with options', () => {
		const cmd: Command = {
			name: 'test',
			description: 'Test command',
			usage: 'hanumate test [--option <value>]',
			options: [
				{
					name: 'option',
					type: 'string',
					description: 'An option',
					required: true,
				},
			],
			examples: ['hanumate test --option value'],
			handler: async () => {},
		};

		expect(cmd.name).toBe('test');
		expect(cmd.options?.[0].required).toBe(true);
	});
});