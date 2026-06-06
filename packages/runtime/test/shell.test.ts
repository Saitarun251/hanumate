/**
 * Tests for shell execution module
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec, execStream, getDefaultEnv } from '../src/shell.js';
import { mk, remove, write, read } from '../src/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Shell Execution', () => {
	const testDir = join(tmpdir(), 'hanumate-shell-test');

	beforeAll(async () => {
		await mk(testDir, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup handled by individual tests
	});

	describe('exec', () => {
		it('should execute a simple command and return stdout', async () => {
			const result = await exec('echo "hello world"');
			expect(result.stdout.trim()).toBe('hello world');
			expect(result.exitCode).toBe(0);
			expect(result.timedOut).toBe(false);
		});

		it('should capture stderr separately', async () => {
			const result = await exec('echo "error message" >&2');
			expect(result.stderr.trim()).toBe('error message');
			expect(result.exitCode).toBe(0);
		});

		it('should execute with custom cwd', async () => {
			const result = await exec('pwd', testDir);
			expect(result.stdout.trim()).toBe(testDir);
			expect(result.exitCode).toBe(0);
		});

		it('should handle custom environment variables', async () => {
			const result = await exec(
				'echo $TEST_VAR',
				undefined,
				{ env: { TEST_VAR: 'custom_value' } }
			);
			expect(result.stdout.trim()).toBe('custom_value');
		});

		it('should inherit PATH from default environment', async () => {
			const result = await exec('echo $PATH');
			expect(result.stdout.trim().length).toBeGreaterThan(0);
		});

		it('should timeout for long-running commands', async () => {
			const result = await exec(
				'sleep 10',
				undefined,
				{ timeout: 100 }
			);
			expect(result.timedOut).toBe(true);
		});

		it('should return non-zero exit code for failed commands', async () => {
			const result = await exec('exit 42');
			expect(result.exitCode).toBe(42);
		});

		it('should handle commands that do not exist', async () => {
			const result = await exec('nonexistent_command_12345');
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr.length).toBeGreaterThan(0);
		});

		it('should handle piped commands', async () => {
			const result = await exec('echo "line1\nline2\nline3" | wc -l');
			expect(result.stdout.trim()).toBe('3');
		});
	});

	describe('execStream', () => {
		it('should stream stdout data', async () => {
			const chunks: string[] = [];
			const result = execStream('echo "chunk1" && echo "chunk2"', testDir, {}, {
				onStdout: (data) => chunks.push(data),
				onClose: () => {},
			});

			// Wait for execution
			await new Promise<void>((resolve) => {
				result.onClose = () => resolve();
				setTimeout(resolve, 1000); // Fallback timeout
			});

			expect(chunks.join('').trim()).toContain('chunk1');
		});

		it('should provide kill function', () => {
			const process = execStream('sleep 100', testDir);
			expect(typeof process.kill).toBe('function');
			process.kill();
		});
	});

	describe('getDefaultEnv', () => {
		it('should return an object with common environment variables', () => {
			const env = getDefaultEnv();
			expect(env).toBeDefined();
			expect(typeof env).toBe('object');
		});

		it('should include PATH', () => {
			const env = getDefaultEnv();
			expect(env.PATH).toBeDefined();
		});

		it('should include HOME', () => {
			const env = getDefaultEnv();
			expect(env.HOME).toBeDefined();
		});

		it('should include PWD set to current directory', () => {
			const env = getDefaultEnv();
			expect(env.PWD).toBe(process.cwd());
		});
	});
});
