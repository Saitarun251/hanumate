/**
 * Tests for harness integration with shell and filesystem
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { mk, write, read } from '../src/fs.js';

// Create mock module for pi-agent-core
vi.mock('@earendil-works/pi-agent-core', () => ({
	createAgent: vi.fn(() => ({
		run: vi.fn(() => Promise.resolve({ type: 'result', message: 'mocked response' })),
	})),
}));

// Import after mocking
import { createAgent, init, type HanumateConfig } from '../src/harness.js';

describe('Harness Integration', () => {
	const testDir = join(tmpdir(), 'hanumate-harness-test');

	beforeAll(async () => {
		await mk(testDir, { recursive: true });
	});

	afterAll(async () => {
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('createAgent', () => {
		it('should create agent with default model', () => {
			const agent = createAgent({});
			expect(agent.model).toBe('anthropic/claude-sonnet-4-6');
		});

		it('should create agent with custom model', () => {
			const agent = createAgent({ model: 'custom/model' });
			expect(agent.model).toBe('custom/model');
		});

		it('should include environment variables', () => {
			const agent = createAgent({});
			expect(agent.env).toBeDefined();
			expect(agent.env.PATH).toBeDefined();
			expect(agent.env.HOME).toBeDefined();
		});

		it('should merge custom environment variables', () => {
			const agent = createAgent({
				env: {
					CUSTOM_VAR: 'custom_value',
					PATH: '/custom/path',
				},
			});
			expect(agent.env.CUSTOM_VAR).toBe('custom_value');
			expect(agent.env.PATH).toBe('/custom/path');
		});
	});

	describe('Session shell execution', () => {
		it('should execute shell commands via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			// Test shell execution
			const result = await session.shell('echo "test"');
			expect(result.stdout.trim()).toBe('test');
			expect(result.exitCode).toBe(0);
		});

		it('should pass cwd to shell commands', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const result = await session.shell('pwd', testDir);
			expect(result.stdout.trim()).toBe(testDir);
		});

		it('should use agent environment in shell', async () => {
			const agent = createAgent({
				env: { TEST_VAR: 'session_env_test' },
			});
			const harness = await init(agent);
			const session = harness.session();

			const result = await session.shell('echo $TEST_VAR');
			expect(result.stdout.trim()).toBe('session_env_test');
		});
	});

	describe('Session filesystem operations', () => {
		it('should write and read files via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const filePath = join(testDir, 'session_test.txt');
			const content = 'Hello from session!';

			await session.writeFile(filePath, content);
			const result = await session.readFile(filePath);
			expect(result).toBe(content);
		});

		it('should create directories via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const dirPath = join(testDir, 'session_dir');
			await session.mkdir(dirPath);
			expect(session.pathExists(dirPath)).toBe(true);
		});

		it('should list directory contents via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			// Create test files
			await session.writeFile(join(testDir, 'a.txt'), 'a');
			await session.writeFile(join(testDir, 'b.txt'), 'b');

			const entries = await session.readDir(testDir);
			expect(Array.isArray(entries)).toBe(true);
		});

		it('should check path existence', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const filePath = join(testDir, 'exists_test.txt');
			await session.writeFile(filePath, 'test');

			expect(session.pathExists(filePath)).toBe(true);
			expect(session.pathExists(join(testDir, 'nonexistent.txt'))).toBe(false);
		});

		it('should get file stats via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const filePath = join(testDir, 'stat_test.txt');
			await session.writeFile(filePath, 'stats content');

			const stats = await session.stat(filePath);
			expect(stats.isFile()).toBe(true);
			expect(stats.size).toBeGreaterThan(0);
		});

		it('should copy files via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const srcPath = join(testDir, 'copy_src.txt');
			const destPath = join(testDir, 'copy_dest.txt');

			await session.writeFile(srcPath, 'copy content');
			await session.copyFile(srcPath, destPath);

			const result = await session.readFile(destPath);
			expect(result).toBe('copy content');
		});

		it('should delete files via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const filePath = join(testDir, 'delete_me.txt');
			await session.writeFile(filePath, 'delete');
			await session.deleteFile(filePath);

			expect(session.pathExists(filePath)).toBe(false);
		});

		it('should move files via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const srcPath = join(testDir, 'move_src.txt');
			const destPath = join(testDir, 'move_dest.txt');

			await session.writeFile(srcPath, 'move content');
			await session.moveFile(srcPath, destPath);

			expect(session.pathExists(destPath)).toBe(true);
			expect(session.pathExists(srcPath)).toBe(false);
		});

		it('should use path utilities via session', async () => {
			const agent = createAgent({});
			const harness = await init(agent);
			const session = harness.session();

			const resolved = session.resolve('./relative');
			expect(session.join('a', 'b')).toBeDefined();
			expect(resolved).toBeDefined();
		});
	});

	describe('Config-based shell timeout', () => {
		it('should use config timeout', async () => {
			const config: HanumateConfig = {
				shellTimeout: 5000,
			};
			const agent = createAgent(config);
			const harness = await init(agent, { config });
			const session = harness.session();

			// This should not timeout immediately
			const result = await session.shell('echo "quick"');
			expect(result.stdout.trim()).toBe('quick');
		});
	});
});
