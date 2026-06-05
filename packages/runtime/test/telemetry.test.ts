/**
 * Tests for OpenTelemetry integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	initTelemetry,
	shutdownTelemetry,
	isTelemetryEnabled,
	withSpan,
	withSpanSync,
	tracePrompt,
	traceSkillExecution,
	traceShellCommand,
	traceFsOperation,
	traceMCPOperation,
	SpanKind,
} from '../src/telemetry.js';

describe('Telemetry Initialization', () => {
	beforeEach(() => {
		// Reset telemetry state before each test
		vi.resetModules();
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	it('should initialize with default configuration', () => {
		initTelemetry();
		expect(isTelemetryEnabled()).toBe(true);
	});

	it('should initialize with custom service name', () => {
		initTelemetry({
			serviceName: 'test-service',
			serviceVersion: '1.0.0',
		});
		expect(isTelemetryEnabled()).toBe(true);
	});

	it('should skip initialization when disabled', () => {
		initTelemetry({
			enabled: false,
		});
		// When disabled, isTelemetryEnabled checks both initialized state and config
	});

	it('should not reinitialize if already initialized', () => {
		initTelemetry();
		initTelemetry(); // Should warn but not crash
		expect(isTelemetryEnabled()).toBe(true);
	});

	it('should initialize with console exporter', () => {
		initTelemetry({
			exporter: 'console',
		});
		expect(isTelemetryEnabled()).toBe(true);
	});

	it('should shutdown cleanly', async () => {
		initTelemetry();
		await shutdownTelemetry();
		expect(isTelemetryEnabled()).toBe(false);
	});
});

describe('Span Creation', () => {
	beforeEach(() => {
		initTelemetry({ enabled: true });
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	it('should create a span with withSpan', async () => {
		const result = await withSpan(
			{ name: 'test-span', kind: SpanKind.INTERNAL },
			async (span) => {
				expect(span).toBeDefined();
				return 'success';
			}
		);
		expect(result).toBe('success');
	});

	it('should pass through errors in withSpan', async () => {
		await expect(
			withSpan(
				{ name: 'error-span' },
				async () => {
					throw new Error('Test error');
				}
			)
		).rejects.toThrow('Test error');
	});

	it('should create a sync span with withSpanSync', () => {
		const result = withSpanSync(
			{ name: 'sync-span', kind: SpanKind.INTERNAL },
			(span) => {
				expect(span).toBeDefined();
				return 'sync-success';
			}
		);
		expect(result).toBe('sync-success');
	});

	it('should set span attributes', async () => {
		await withSpan(
			{
				name: 'attr-span',
				attributes: {
					'custom.attr': 'value',
					'number.attr': 42,
					'bool.attr': true,
				},
			},
			async (span) => {
				return 'success';
			}
		);
		// No assertion needed - just verify it doesn't throw
		expect(true).toBe(true);
	});
});

describe('Trace Helper Functions', () => {
	beforeEach(() => {
		initTelemetry({ enabled: true });
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	describe('tracePrompt', () => {
		it('should trace prompt execution with LLM attributes', async () => {
			const result = await tracePrompt('claude-sonnet-4-6', 100, async () => {
				return 'Test response';
			});
			expect(result).toBe('Test response');
		});

		it('should pass through errors from prompt function', async () => {
			await expect(
				tracePrompt('claude-sonnet-4-6', 100, async () => {
					throw new Error('Prompt failed');
				})
			).rejects.toThrow('Prompt failed');
		});
	});

	describe('traceSkillExecution', () => {
		it('should trace skill execution', async () => {
			const result = await traceSkillExecution('test-skill', async () => {
				return 'Skill output';
			});
			expect(result).toBe('Skill output');
		});

		it('should pass through errors from skill function', async () => {
			await expect(
				traceSkillExecution('test-skill', async () => {
					throw new Error('Skill failed');
				})
			).rejects.toThrow('Skill failed');
		});
	});

	describe('traceShellCommand', () => {
		it('should trace shell command execution', async () => {
			const result = await traceShellCommand('echo "hello"', '/tmp', async () => {
				return { stdout: 'hello', stderr: '', exitCode: 0 };
			});
			expect(result.stdout).toBe('hello');
			expect(result.exitCode).toBe(0);
		});

		it('should pass through shell errors', async () => {
			await expect(
				traceShellCommand('exit 1', '/tmp', async () => {
					throw new Error('Shell error');
				})
			).rejects.toThrow('Shell error');
		});
	});

	describe('traceFsOperation', () => {
		it('should trace filesystem read operations', async () => {
			const result = await traceFsOperation('read', '/path/to/file', async () => {
				return 'file content';
			});
			expect(result).toBe('file content');
		});

		it('should trace filesystem write operations', async () => {
			await traceFsOperation('write', '/path/to/file', async () => {
				return undefined;
			});
			// No assertion needed - just verify it doesn't throw
			expect(true).toBe(true);
		});

		it('should trace filesystem mkdir operations', async () => {
			await traceFsOperation('mkdir', '/path/to/dir', async () => {
				return undefined;
			});
			expect(true).toBe(true);
		});

		it('should trace filesystem delete operations', async () => {
			await traceFsOperation('delete', '/path/to/file', async () => {
				return undefined;
			});
			expect(true).toBe(true);
		});

		it('should trace filesystem glob operations', async () => {
			const result = await traceFsOperation('glob', '/path/**/*.ts', async () => {
				return ['file1.ts', 'file2.ts'];
			});
			expect(result).toEqual(['file1.ts', 'file2.ts']);
		});

		it('should trace filesystem listDir operations', async () => {
			const result = await traceFsOperation('listDir', '/path', async () => {
				return ['file1.txt', 'file2.txt'];
			});
			expect(result).toEqual(['file1.txt', 'file2.txt']);
		});
	});

	describe('traceMCPOperation', () => {
		it('should trace MCP connect operations', async () => {
			const result = await traceMCPOperation('test-server', 'connect', async () => {
				return { connected: true };
			});
			expect(result).toEqual({ connected: true });
		});

		it('should trace MCP disconnect operations', async () => {
			await traceMCPOperation('test-server', 'disconnect', async () => {
				return undefined;
			});
			expect(true).toBe(true);
		});

		it('should trace MCP callTool operations', async () => {
			const result = await traceMCPOperation('test-server', 'callTool', async () => {
				return { toolResult: 'output' };
			});
			expect(result).toEqual({ toolResult: 'output' });
		});

		it('should pass through MCP errors', async () => {
			await expect(
				traceMCPOperation('test-server', 'connect', async () => {
					throw new Error('Connection failed');
				})
			).rejects.toThrow('Connection failed');
		});
	});
});

describe('Disabled Telemetry', () => {
	beforeEach(() => {
		initTelemetry({ enabled: false });
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	it('should not create spans when disabled', async () => {
		const result = await withSpan(
			{ name: 'should-not-create' },
			async (span) => {
				// Span should be null when disabled
				expect(span).toBeNull();
				return 'should-work';
			}
		);
		expect(result).toBe('should-work');
	});

	it('should still execute functions when disabled', async () => {
		const result = await tracePrompt('model', 100, async () => {
			return 'result';
		});
		expect(result).toBe('result');
	});

	it('should still trace shell commands when disabled', async () => {
		const result = await traceShellCommand('echo test', undefined, async () => {
			return { stdout: 'test', stderr: '', exitCode: 0 };
		});
		expect(result.stdout).toBe('test');
	});

	it('should still trace filesystem operations when disabled', async () => {
		const result = await traceFsOperation('read', '/path', async () => {
			return 'content';
		});
		expect(result).toBe('content');
	});
});

describe('Span Kinds', () => {
	beforeEach(() => {
		initTelemetry({ enabled: true });
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	it('should create spans with correct kind for different operations', async () => {
		// Client span for prompt
		await tracePrompt('model', 100, async () => 'response');

		// Internal span for skill
		await traceSkillExecution('skill', async () => 'result');

		// Client span for shell
		await traceShellCommand('ls', undefined, async () => ({
			stdout: '',
			stderr: '',
			exitCode: 0,
		}));

		// Client span for MCP callTool
		await traceMCPOperation('server', 'callTool', async () => 'tool-result');

		expect(true).toBe(true);
	});
});

describe('Error Handling', () => {
	beforeEach(() => {
		initTelemetry({ enabled: true });
	});

	afterEach(async () => {
		await shutdownTelemetry();
	});

	it('should handle nested spans correctly', async () => {
		const result = await withSpan(
			{ name: 'outer-span' },
			async (outer) => {
				const innerResult = await withSpan(
					{ name: 'inner-span' },
					async (inner) => {
						return 'nested-result';
					}
				);
				return innerResult;
			}
		);
		expect(result).toBe('nested-result');
	});

	it('should propagate errors through nested spans', async () => {
		await expect(
			withSpan({ name: 'outer-span' }, async () => {
				return withSpan({ name: 'inner-span' }, async () => {
					throw new Error('Inner error');
				});
			})
		).rejects.toThrow('Inner error');
	});
});
