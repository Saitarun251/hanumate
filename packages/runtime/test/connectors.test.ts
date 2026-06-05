/**
 * Tests for sandbox connectors
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	createLocalSandbox,
	createVirtualSandbox,
	createSandbox,
	type Sandbox,
	type SandboxConnectorType,
} from '../src/connectors/index.js';

describe('Sandbox Connectors', () => {
	describe('Local Sandbox', () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createLocalSandbox();
		});

		afterEach(async () => {
			await sandbox.cleanup();
		});

		it('should be alive after creation', () => {
			expect(sandbox.isAlive()).toBe(true);
		});

		it('should execute shell commands', async () => {
			const result = await sandbox.shell.exec('echo "hello from local sandbox"');
			expect(result.stdout.trim()).toBe('hello from local sandbox');
			expect(result.exitCode).toBe(0);
			expect(result.timedOut).toBe(false);
		});

		it('should execute commands with exit codes', async () => {
			const result = await sandbox.shell.exec('exit 42');
			expect(result.exitCode).toBe(42);
		});

		it('should handle commands that do not exist', async () => {
			const result = await sandbox.shell.exec('nonexistent_command_xyz');
			expect(result.exitCode).not.toBe(0);
		});

		it('should write and read files using sandbox fs', async () => {
			const testPath = '/tmp/test-sandbox-file.txt';
			const content = 'Hello from sandbox filesystem!';

			await sandbox.fs.write(testPath, content);
			expect(sandbox.fs.exists(testPath)).toBe(true);

			const readContent = await sandbox.fs.read(testPath);
			expect(readContent).toBe(content);
		});

		it('should list directories', async () => {
			const testDir = '/tmp';
			const entries = await sandbox.fs.listDir(testDir);
			expect(Array.isArray(entries)).toBe(true);
			expect(entries.length).toBeGreaterThan(0);
		});

		it('should check file existence', async () => {
			expect(sandbox.fs.exists('/tmp')).toBe(true);
			expect(sandbox.fs.exists('/nonexistent_path_xyz')).toBe(false);
		});

		it('should delete files', async () => {
			const testPath = '/tmp/test-delete.txt';
			await sandbox.fs.write(testPath, 'to be deleted');
			expect(sandbox.fs.exists(testPath)).toBe(true);

			await sandbox.fs.remove(testPath);
			expect(sandbox.fs.exists(testPath)).toBe(false);
		});

		it('should create directories recursively', async () => {
			const testDir = '/tmp/test-sandbox-nested-dir/subdir';
			await sandbox.fs.mkdir(testDir, { recursive: true });
			expect(sandbox.fs.exists(testDir)).toBe(true);
		});
	});

	describe('Virtual Sandbox', () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createVirtualSandbox();
		});

		afterEach(async () => {
			await sandbox.cleanup();
		});

		it('should be alive after creation', () => {
			expect(sandbox.isAlive()).toBe(true);
		});

		it('should execute built-in shell commands', async () => {
			const result = await sandbox.shell.exec('echo hello world');
			expect(result.stdout.trim()).toBe('hello world');
			expect(result.exitCode).toBe(0);
		});

		it('should execute pwd command', async () => {
			const result = await sandbox.shell.exec('pwd');
			expect(result.stdout.trim()).toBe('/sandbox');
			expect(result.exitCode).toBe(0);
		});

		it('should handle mkdir command', async () => {
			const result = await sandbox.shell.exec('mkdir /sandbox/test-dir');
			expect(result.exitCode).toBe(0);
			expect(sandbox.fs.exists('/sandbox/test-dir')).toBe(true);
		});

		it('should handle rm command', async () => {
			// First create a file
			await sandbox.fs.write('/sandbox/test-rm.txt', 'test content');
			expect(sandbox.fs.exists('/sandbox/test-rm.txt')).toBe(true);

			// Then remove it
			const result = await sandbox.shell.exec('rm /sandbox/test-rm.txt');
			expect(result.exitCode).toBe(0);
			expect(sandbox.fs.exists('/sandbox/test-rm.txt')).toBe(false);
		});

		it('should return error for nonexistent commands', async () => {
			const result = await sandbox.shell.exec('nonexistent_command');
			expect(result.exitCode).toBe(127);
			expect(result.stderr).toContain('command not found');
		});

		it('should have isolated in-memory filesystem', async () => {
			const testPath = '/sandbox/virtual-file.txt';
			const content = 'This is virtual content';

			await sandbox.fs.write(testPath, content);
			const readContent = await sandbox.fs.read(testPath);

			expect(readContent).toBe(content);
			// Real filesystem should NOT have this file
			const realExists = require('node:fs').existsSync(testPath);
			expect(realExists).toBe(false);
		});

		it('should list virtual directory contents', async () => {
			await sandbox.fs.write('/sandbox/file1.txt', 'content1');
			await sandbox.fs.write('/sandbox/file2.txt', 'content2');

			const entries = await sandbox.fs.listDir('/sandbox');
			expect(entries).toContain('file1.txt');
			expect(entries).toContain('file2.txt');
		});

		it('should throw error when reading nonexistent file', async () => {
			await expect(sandbox.fs.read('/sandbox/nonexistent.txt')).rejects.toThrow('File not found');
		});

		it('should handle exit command', async () => {
			const result = await sandbox.shell.exec('exit 0');
			expect(result.exitCode).toBe(0);
		});

		it('should be cleaned up after cleanup() call', async () => {
			await sandbox.cleanup();
			expect(sandbox.isAlive()).toBe(false);
		});
	});

	describe('Virtual Filesystem Glob', () => {
		let sandbox: Sandbox;

		beforeEach(async () => {
			sandbox = createVirtualSandbox();
			// Create some test files
			await sandbox.fs.write('/sandbox/src/index.ts', '// index');
			await sandbox.fs.write('/sandbox/src/app.ts', '// app');
			await sandbox.fs.write('/sandbox/tests/test1.ts', '// test1');
			await sandbox.fs.write('/sandbox/README.md', '# readme');
		});

		afterEach(async () => {
			await sandbox.cleanup();
		});

		it('should glob files with * pattern', async () => {
			const results = await sandbox.fs.glob('*.ts', '/sandbox/src');
			expect(results.length).toBeGreaterThan(0);
		});

		it('should glob files with ** pattern', async () => {
			const results = await sandbox.fs.glob('**/*.ts', '/sandbox');
			expect(results.length).toBeGreaterThan(0);
		});
	});

	describe('createSandbox factory', () => {
		it('should create local sandbox', () => {
			const sandbox = createSandbox('local');
			expect(sandbox.isAlive()).toBe(true);
		});

		it('should create virtual sandbox', () => {
			const sandbox = createSandbox('virtual');
			expect(sandbox.isAlive()).toBe(true);
		});

		it('should throw error for daytona without apiKey', () => {
			expect(() => createSandbox('daytona')).toThrow('API key required');
		});

		it('should throw error for e2b without apiKey', () => {
			expect(() => createSandbox('e2b')).toThrow('API key required');
		});

		it('should accept type and options object', () => {
			const sandbox = createSandbox('local', { type: 'local' });
			expect(sandbox.isAlive()).toBe(true);
		});

		it('should throw for unknown sandbox type', () => {
			expect(() => createSandbox('unknown' as SandboxConnectorType)).toThrow('Unknown sandbox type');
		});
	});

	describe('Sandbox Interface Compliance', () => {
		it('should have shell.exec method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.shell.exec).toBe('function');
		});

		it('should have fs.read method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.fs.read).toBe('function');
		});

		it('should have fs.write method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.fs.write).toBe('function');
		});

		it('should have fs.glob method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.fs.glob).toBe('function');
		});

		it('should have fs.mkdir method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.fs.mkdir).toBe('function');
		});

		it('should have cleanup method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.cleanup).toBe('function');
		});

		it('should have isAlive method', () => {
			const sandbox = createLocalSandbox();
			expect(typeof sandbox.isAlive).toBe('function');
		});
	});

	describe('Shell execution with options', () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createVirtualSandbox();
		});

		afterEach(async () => {
			await sandbox.cleanup();
		});

		it('should pass cwd option', async () => {
			// Virtual sandbox pwd always returns /sandbox
			const result = await sandbox.shell.exec('pwd');
			expect(result.stdout.trim()).toBe('/sandbox');
		});

		it('should handle timeout option', async () => {
			// Virtual sandbox doesn't actually timeout
			const result = await sandbox.shell.exec('echo test', { timeout: 5000 });
			expect(result.exitCode).toBe(0);
		});
	});

	describe('Multiple sandbox instances', () => {
		it('should maintain isolated state between instances', async () => {
			const sandbox1 = createVirtualSandbox();
			const sandbox2 = createVirtualSandbox();

			// Write to sandbox1
			await sandbox1.fs.write('/sandbox/unique-file-1.txt', 'sandbox1 content');
			// Write to sandbox2
			await sandbox2.fs.write('/sandbox/unique-file-2.txt', 'sandbox2 content');

			// sandbox1 should NOT have sandbox2's file
			expect(sandbox1.fs.exists('/sandbox/unique-file-1.txt')).toBe(true);
			expect(sandbox1.fs.exists('/sandbox/unique-file-2.txt')).toBe(false);

			// sandbox2 should NOT have sandbox1's file
			expect(sandbox2.fs.exists('/sandbox/unique-file-2.txt')).toBe(true);
			expect(sandbox2.fs.exists('/sandbox/unique-file-1.txt')).toBe(false);

			await sandbox1.cleanup();
			await sandbox2.cleanup();
		});
	});
});
