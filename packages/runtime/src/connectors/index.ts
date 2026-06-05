/**
 * Sandbox Connectors - Pluggable execution environments for agents
 *
 * This module provides different sandbox implementations that can be used
 * to execute shell commands and filesystem operations in isolated environments.
 */

import { exec as realExec, execStream, getDefaultEnv, type ExecResult, type ExecOptions } from '../shell.js';
import { resolve, join, relative, basename, dirname, extname, isAbsolute } from 'node:path';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
}

export interface SandboxFs {
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	glob(pattern: string, cwd?: string): Promise<string[]>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	exists(path: string): boolean;
	remove(path: string): Promise<void>;
	listDir(path: string): Promise<string[]>;
}

export interface SandboxShell {
	exec(cmd: string, options?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<ShellResult>;
}

export interface Sandbox {
	shell: SandboxShell;
	fs: SandboxFs;
	/** Cleanup resources when done */
	cleanup(): Promise<void>;
	/** Check if sandbox is still alive */
	isAlive(): boolean;
}

export type SandboxConnectorType = 'local' | 'virtual' | 'daytona' | 'e2b';

export interface SandboxConnectorOptions {
	type: SandboxConnectorType;
	apiKey?: string;
	baseUrl?: string;
}

// ============================================================================
// Virtual Filesystem (In-Memory)
// ============================================================================

interface VirtualFile {
	content: string;
	isDirectory: boolean;
	modified: Date;
}

export class VirtualFilesystem implements SandboxFs {
	private files = new Map<string, VirtualFile>();
	private readonly root: string;

	constructor(root = '/sandbox') {
		this.root = root;
		// Initialize root directory
		this.files.set(root, {
			content: '',
			isDirectory: true,
			modified: new Date(),
		});
	}

	private normalizePath(path: string): string {
		let normalized = path;
		if (!isAbsolute(normalized)) {
			normalized = join(this.root, normalized);
		}
		// Normalize path separators and remove trailing slashes
		normalized = normalized.replace(/\\/g, '/').replace(/\/+/g, '/');
		if (normalized.length > 1 && normalized.endsWith('/')) {
			normalized = normalized.slice(0, -1);
		}
		return normalized;
	}

	private ensureParent(path: string): void {
		const parent = dirname(path);
		if (parent !== path && !this.files.has(parent)) {
			this.ensureParent(parent);
			this.files.set(parent, {
				content: '',
				isDirectory: true,
				modified: new Date(),
			});
		}
	}

	async read(path: string): Promise<string> {
		const normalized = this.normalizePath(path);
		const file = this.files.get(normalized);
		if (!file) {
			throw new Error(`File not found: ${path}`);
		}
		if (file.isDirectory) {
			throw new Error(`Path is a directory: ${path}`);
		}
		return file.content;
	}

	async write(path: string, content: string): Promise<void> {
		const normalized = this.normalizePath(path);
		this.ensureParent(normalized);
		this.files.set(normalized, {
			content,
			isDirectory: false,
			modified: new Date(),
		});
	}

	async glob(pattern: string, cwd?: string): Promise<string[]> {
		const baseDir = cwd ? this.normalizePath(cwd) : this.root;
		const results: string[] = [];

		// Convert glob pattern to regex
		const globToRegex = (glob: string): RegExp => {
			let regexStr = glob
				.replace(/[.+^${}()|[\]\\]/g, '\\$&');
			regexStr = regexStr.replace(/\*\*/g, '{{DOUBLE_STAR}}');
			regexStr = regexStr.replace(/\*/g, '[^/]*');
			regexStr = regexStr.replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
			regexStr = regexStr.replace(/\?/g, '[^/]');
			return new RegExp(`^${regexStr}$`);
		};

		const regex = globToRegex(pattern);
		const hasRecursive = pattern.includes('**');

		// Recursive search
		const search = (dir: string): void => {
			for (const [path, file] of this.files) {
				if (!path.startsWith(dir + '/')) continue;
				const relativePath = relative(baseDir, path);
				if (relativePath.startsWith('..')) continue;

				const matches = hasRecursive || regex.test(relativePath) || regex.test(basename(path));
				if (matches && !file.isDirectory) {
					results.push(path);
				}
			}
		};

		search(baseDir);
		return results;
	}

	async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
		const normalized = this.normalizePath(path);
		if (options?.recursive) {
			this.ensureParent(normalized);
		}
		this.files.set(normalized, {
			content: '',
			isDirectory: true,
			modified: new Date(),
		});
	}

	exists(path: string): boolean {
		return this.files.has(this.normalizePath(path));
	}

	async remove(path: string): Promise<void> {
		const normalized = this.normalizePath(path);
		if (!this.files.has(normalized)) {
			throw new Error(`Path not found: ${path}`);
		}
		this.files.delete(normalized);
	}

	async listDir(path: string): Promise<string[]> {
		const normalized = this.normalizePath(path);
		const file = this.files.get(normalized);
		if (!file) {
			throw new Error(`Directory not found: ${path}`);
		}
		if (!file.isDirectory) {
			throw new Error(`Path is not a directory: ${path}`);
		}

		const results: string[] = [];
		const prefix = normalized + '/';
		for (const filePath of this.files.keys()) {
			if (filePath === normalized) continue;
			if (filePath.startsWith(prefix)) {
				const remainder = filePath.slice(prefix.length);
				if (!remainder.includes('/')) {
					results.push(remainder);
				}
			}
		}
		return results;
	}

	// Debug: get all files
	_debugListAll(): Map<string, VirtualFile> {
		return new Map(this.files);
	}
}

// ============================================================================
// Local Sandbox (Real Shell & Filesystem)
// ============================================================================

function createLocalSandboxInternal(): Sandbox {
	const alive = true;

	return {
		shell: {
			async exec(
				cmd: string,
				options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
			): Promise<ShellResult> {
				const execOptions: ExecOptions = {
					cwd: options?.cwd,
					env: options?.env ?? getDefaultEnv(),
					timeout: options?.timeout ?? 30000,
				};

				const result = await realExec(cmd, options?.cwd, execOptions);
				return {
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					timedOut: result.timedOut,
				};
			},
		},
		fs: {
			// Note: Local filesystem uses the real fs module directly
			// These are placeholder implementations that delegate to real fs
			// For actual local fs operations, use the fs module directly
			async read(path: string): Promise<string> {
				const { readFile } = await import('node:fs/promises');
				return readFile(path, 'utf-8');
			},
			async write(path: string, content: string): Promise<void> {
				const { writeFile, mkdir } = await import('node:fs/promises');
				const { dirname: dir } = await import('node:path');
				try {
					await writeFile(path, content, 'utf-8');
				} catch (err: unknown) {
					const error = err as NodeJS.ErrnoException;
					if (error.code === 'ENOENT') {
						await mkdir(dir(path), { recursive: true });
						await writeFile(path, content, 'utf-8');
					} else {
						throw err;
					}
				}
			},
			async glob(pattern: string, cwd?: string): Promise<string[]> {
				const { glob: realGlob } = await import('../fs.js');
				return realGlob(cwd ?? process.cwd(), { pattern });
			},
			async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
				const { mkdir } = await import('node:fs/promises');
				await mkdir(path, { recursive: options?.recursive ?? true });
			},
			exists(path: string): boolean {
				const { existsSync } = require('node:fs');
				return existsSync(path);
			},
			async remove(path: string): Promise<void> {
				const { unlink } = await import('node:fs/promises');
				await unlink(path);
			},
			async listDir(path: string): Promise<string[]> {
				const { readdir } = await import('node:fs/promises');
				return readdir(path);
			},
		},
		cleanup: async () => {
			// Nothing to cleanup for local sandbox
		},
		isAlive: () => alive,
	};
}

// ============================================================================
// Virtual Sandbox (In-Memory Filesystem + Mock Shell)
// ============================================================================

function createVirtualSandboxInternal(): Sandbox {
	const vfs = new VirtualFilesystem();
	let alive = true;

	return {
		shell: {
			async exec(
				cmd: string,
				options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
			): Promise<ShellResult> {
				if (!alive) {
					return {
						stdout: '',
						stderr: 'Sandbox is not alive',
						exitCode: 1,
						timedOut: false,
					};
				}

				// Parse the command to determine if it's a built-in or external
				const parts = cmd.trim().split(/\s+/);
				const command = parts[0];
				const args = parts.slice(1);

				// Handle built-in virtual filesystem commands
				switch (command) {
					case 'echo': {
						const text = args.join(' ');
						return { stdout: text + '\n', stderr: '', exitCode: 0, timedOut: false };
					}

					case 'cat': {
						if (args.length === 0) {
							return { stdout: '', stderr: 'cat: missing operand\n', exitCode: 1, timedOut: false };
						}
						try {
							const content = await vfs.read(args[0]);
							return { stdout: content + '\n', stderr: '', exitCode: 0, timedOut: false };
						} catch {
							return { stdout: '', stderr: `cat: ${args[0]}: No such file or directory\n`, exitCode: 1, timedOut: false };
						}
					}

					case 'ls': {
						const path = args[0] || '.';
						try {
							const entries = await vfs.listDir(path);
							return { stdout: entries.join('  ') + '\n', stderr: '', exitCode: 0, timedOut: false };
						} catch {
							return { stdout: '', stderr: `ls: cannot access '${path}': No such file or directory\n`, exitCode: 1, timedOut: false };
						}
					}

					case 'pwd': {
						return { stdout: '/sandbox\n', stderr: '', exitCode: 0, timedOut: false };
					}

					case 'mkdir': {
						if (args.length === 0) {
							return { stdout: '', stderr: 'mkdir: missing operand\n', exitCode: 1, timedOut: false };
						}
						await vfs.mkdir(args[0], { recursive: true });
						return { stdout: '', stderr: '', exitCode: 0, timedOut: false };
					}

					case 'touch': {
						if (args.length === 0) {
							return { stdout: '', stderr: 'touch: missing operand\n', exitCode: 1, timedOut: false };
						}
						if (!vfs.exists(args[0])) {
							await vfs.write(args[0], '');
						}
						return { stdout: '', stderr: '', exitCode: 0, timedOut: false };
					}

					case 'rm': {
						if (args.length === 0) {
							return { stdout: '', stderr: 'rm: missing operand\n', exitCode: 1, timedOut: false };
						}
						try {
							await vfs.remove(args[0]);
							return { stdout: '', stderr: '', exitCode: 0, timedOut: false };
						} catch {
							return { stdout: '', stderr: `rm: cannot remove '${args[0]}': No such file or directory\n`, exitCode: 1, timedOut: false };
						}
					}

					case 'test': {
						// Handle test command for conditionals (e.g., test -f, test -d)
						if (args[0] === '-f') {
							const exists = vfs.exists(args[1] || '');
							return { stdout: '', stderr: '', exitCode: exists ? 0 : 1, timedOut: false };
						}
						if (args[0] === '-d') {
							return { stdout: '', stderr: '', exitCode: 1, timedOut: false }; // Directories not fully supported
						}
						return { stdout: '', stderr: '', exitCode: 1, timedOut: false };
					}

					case 'exit': {
						const code = parseInt(args[0] || '0', 10);
						return { stdout: '', stderr: '', exitCode: code, timedOut: false };
					}

					default: {
						// Unknown command - simulate not found
						return {
							stdout: '',
							stderr: `${command}: command not found\n`,
							exitCode: 127,
							timedOut: false,
						};
					}
				}
			},
		},
		fs: vfs,
		cleanup: async () => {
			alive = false;
			vfs._debugListAll().clear();
		},
		isAlive: () => alive,
	};
}

// ============================================================================
// Daytona Sandbox (Container-based)
// ============================================================================

interface DaytonaConfig {
	apiKey: string;
	baseUrl?: string;
}

async function daytonaCreate(config: DaytonaConfig): Promise<{
	containerId: string;
	workspaceUrl: string;
}> {
	// Daytona API endpoint for creating a new workspace/container
	const baseUrl = config.baseUrl || 'https://app.daytona.io/api/v1';

	const response = await fetch(`${baseUrl}/workspace`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			// Daytona workspace options
			gitProvider: 'github',
			repository: '',
			language: 'typescript',
		}),
	});

	if (!response.ok) {
		throw new Error(`Daytona API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as { id: string; url: string };
	return {
		containerId: data.id,
		workspaceUrl: data.url,
	};
}

async function daytonaExec(
	containerId: string,
	command: string,
	config: DaytonaConfig
): Promise<ShellResult> {
	const baseUrl = config.baseUrl || 'https://app.daytona.io/api/v1';

	const response = await fetch(`${baseUrl}/workspace/${containerId}/exec`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ command }),
	});

	if (!response.ok) {
		throw new Error(`Daytona exec error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as { stdout: string; stderr: string; exitCode: number };
	return {
		stdout: data.stdout,
		stderr: data.stderr,
		exitCode: data.exitCode,
		timedOut: false,
	};
}

async function daytonaStop(containerId: string, config: DaytonaConfig): Promise<void> {
	const baseUrl = config.baseUrl || 'https://app.daytona.io/api/v1';

	const response = await fetch(`${baseUrl}/workspace/${containerId}`, {
		method: 'DELETE',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
		},
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Daytona stop error: ${response.status} ${response.statusText}`);
	}
}

function createDaytonaSandboxInternal(apiKey: string, baseUrl?: string): Sandbox {
	const config: DaytonaConfig = { apiKey, baseUrl };
	let containerId: string | null = null;
	let workspaceUrl: string | null = null;
	let alive = false;

	return {
		shell: {
			async exec(
				cmd: string,
				options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
			): Promise<ShellResult> {
				if (!alive || !containerId) {
					return {
						stdout: '',
						stderr: 'Daytona sandbox not initialized',
						exitCode: 1,
						timedOut: false,
					};
				}

				try {
					return await daytonaExec(containerId, cmd, config);
				} catch (err) {
					return {
						stdout: '',
						stderr: `Daytona exec error: ${err instanceof Error ? err.message : 'Unknown error'}`,
						exitCode: 1,
						timedOut: false,
					};
				}
			},
		},
		fs: {
			// For Daytona, filesystem operations go through exec commands
			async read(path: string): Promise<string> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				const result = await daytonaExec(containerId, `cat ${path}`, config);
				if (result.exitCode !== 0) {
					throw new Error(`Failed to read ${path}: ${result.stderr}`);
				}
				return result.stdout;
			},
			async write(path: string, content: string): Promise<void> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				// Use base64 encoding for complex content
				const encoded = Buffer.from(content).toString('base64');
				await daytonaExec(containerId, `echo "${encoded}" | base64 -d > ${path}`, config);
			},
			async glob(pattern: string, cwd?: string): Promise<string[]> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				const dir = cwd || '.';
				const result = await daytonaExec(containerId, `find ${dir} -name "${pattern}" -type f`, config);
				if (result.exitCode !== 0) {
					return [];
				}
				return result.stdout.split('\n').filter(Boolean);
			},
			async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				const flags = options?.recursive ? '-p' : '';
				await daytonaExec(containerId, `mkdir ${flags} ${path}`, config);
			},
			exists(path: string): boolean {
				// Sync check not possible for remote sandbox
				return false;
			},
			async remove(path: string): Promise<void> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				await daytonaExec(containerId, `rm ${path}`, config);
			},
			async listDir(path: string): Promise<string[]> {
				if (!alive || !containerId) throw new Error('Sandbox not initialized');
				const result = await daytonaExec(containerId, `ls -1 ${path}`, config);
				if (result.exitCode !== 0) {
					throw new Error(`Failed to list ${path}: ${result.stderr}`);
				}
				return result.stdout.split('\n').filter(Boolean);
			},
		},
		async cleanup(): Promise<void> {
			if (containerId) {
				await daytonaStop(containerId, config);
				containerId = null;
				workspaceUrl = null;
			}
			alive = false;
		},
		isAlive: () => alive,
	};
}

// Extend Sandbox type for Daytona initialization
export interface DaytonaSandbox extends Sandbox {
	workspaceUrl: string | null;
}

// Extend Sandbox type for Daytona initialization
export interface DaytonaSandbox extends Sandbox {
	_initialize(): Promise<void>;
	workspaceUrl: string | null;
}

// ============================================================================
// E2B Sandbox
// ============================================================================

interface E2BConfig {
	apiKey: string;
	baseUrl?: string;
	template?: string;
}

interface E2BRuntime {
	id: string;
	host: string;
}

async function e2bStart(config: E2BConfig): Promise<E2BRuntime> {
	const baseUrl = config.baseUrl || 'https://api.e2b.dev/api/v1';

	const response = await fetch(`${baseUrl}/runtime/start`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			template: config.template || 'base',
		}),
	});

	if (!response.ok) {
		throw new Error(`E2B API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as { id: string; host: string };
	return {
		id: data.id,
		host: data.host,
	};
}

async function e2bExec(
	runtimeId: string,
	command: string,
	config: E2BConfig
): Promise<ShellResult> {
	const baseUrl = config.baseUrl || 'https://api.e2b.dev/api/v1';

	const response = await fetch(`${baseUrl}/runtime/${runtimeId}/exec`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ cmd: command, timeout: 30000 }),
	});

	if (!response.ok) {
		throw new Error(`E2B exec error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as { stdout: string; stderr: string; exit_code: number };
	return {
		stdout: data.stdout || '',
		stderr: data.stderr || '',
		exitCode: data.exit_code,
		timedOut: false,
	};
}

async function e2bUpload(
	runtimeId: string,
	content: string,
	remotePath: string,
	config: E2BConfig
): Promise<void> {
	const baseUrl = config.baseUrl || 'https://api.e2b.dev/api/v1';
	const encoded = Buffer.from(content).toString('base64');

	const response = await fetch(`${baseUrl}/runtime/${runtimeId}/upload`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			file: encoded,
			path: remotePath,
		}),
	});

	if (!response.ok) {
		throw new Error(`E2B upload error: ${response.status} ${response.statusText}`);
	}
}

async function e2bDownload(
	runtimeId: string,
	remotePath: string,
	config: E2BConfig
): Promise<string> {
	const baseUrl = config.baseUrl || 'https://api.e2b.dev/api/v1';

	const response = await fetch(`${baseUrl}/runtime/${runtimeId}/download?path=${encodeURIComponent(remotePath)}`, {
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`E2B download error: ${response.status} ${response.statusText}`);
	}

	const encoded = await response.text() as string;
	return Buffer.from(encoded, 'base64').toString('utf-8');
}

async function e2bStop(runtimeId: string, config: E2BConfig): Promise<void> {
	const baseUrl = config.baseUrl || 'https://api.e2b.dev/api/v1';

	const response = await fetch(`${baseUrl}/runtime/${runtimeId}/stop`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
		},
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`E2B stop error: ${response.status} ${response.statusText}`);
	}
}

function createE2BSandboxInternal(apiKey: string, baseUrl?: string, template?: string): Sandbox {
	const config: E2BConfig = { apiKey, baseUrl, template };
	let runtime: E2BRuntime | null = null;
	let alive = false;

	return {
		shell: {
			async exec(
				cmd: string,
				options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
			): Promise<ShellResult> {
				if (!alive || !runtime) {
					return {
						stdout: '',
						stderr: 'E2B sandbox not initialized',
						exitCode: 1,
						timedOut: false,
					};
				}

				try {
					// Prepend cwd if specified
					const fullCmd = options?.cwd ? `cd ${options.cwd} && ${cmd}` : cmd;
					return await e2bExec(runtime.id, fullCmd, config);
				} catch (err) {
					return {
						stdout: '',
						stderr: `E2B exec error: ${err instanceof Error ? err.message : 'Unknown error'}`,
						exitCode: 1,
						timedOut: false,
					};
				}
			},
		},
		fs: {
			async read(path: string): Promise<string> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				try {
					return await e2bDownload(runtime.id, path, config);
				} catch (err) {
					throw new Error(`Failed to read ${path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
				}
			},
			async write(path: string, content: string): Promise<void> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				await e2bUpload(runtime.id, content, path, config);
			},
			async glob(pattern: string, cwd?: string): Promise<string[]> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				const dir = cwd || '/home/user';
				const result = await e2bExec(runtime.id, `find ${dir} -name "${pattern}" -type f 2>/dev/null`, config);
				if (result.exitCode !== 0) {
					return [];
				}
				return result.stdout.split('\n').filter(Boolean);
			},
			async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				const flags = options?.recursive ? '-p' : '';
				await e2bExec(runtime.id, `mkdir ${flags} ${path}`, config);
			},
			exists(path: string): boolean {
				// Sync check not possible for remote sandbox
				return false;
			},
			async remove(path: string): Promise<void> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				await e2bExec(runtime.id, `rm ${path}`, config);
			},
			async listDir(path: string): Promise<string[]> {
				if (!alive || !runtime) throw new Error('Sandbox not initialized');
				const result = await e2bExec(runtime.id, `ls -1 ${path}`, config);
				if (result.exitCode !== 0) {
					throw new Error(`Failed to list ${path}: ${result.stderr}`);
				}
				return result.stdout.split('\n').filter(Boolean);
			},
		},
		async cleanup(): Promise<void> {
			if (runtime) {
				await e2bStop(runtime.id, config);
				runtime = null;
			}
			alive = false;
		},
		isAlive: () => alive,
	};
}

// Extend Sandbox type for E2B initialization
export interface E2BSandbox extends Sandbox {
	runtimeId?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a local sandbox using real shell and filesystem
 */
export function createLocalSandbox(): Sandbox {
	return createLocalSandboxInternal();
}

/**
 * Create a virtual sandbox with in-memory filesystem
 */
export function createVirtualSandbox(): Sandbox {
	return createVirtualSandboxInternal();
}

/**
 * Create a Daytona sandbox (container-based)
 * @param apiKey - Daytona API key
 * @param baseUrl - Optional custom API base URL
 */
export function createDaytonaSandbox(apiKey: string, baseUrl?: string): DaytonaSandbox {
	return createDaytonaSandboxInternal(apiKey, baseUrl) as DaytonaSandbox;
}

/**
 * Create an E2B sandbox
 * @param apiKey - E2B API key
 * @param baseUrl - Optional custom API base URL
 * @param template - Optional template name (default: 'base')
 */
export function createE2BSandbox(apiKey: string, baseUrl?: string, template?: string): E2BSandbox {
	return createE2BSandboxInternal(apiKey, baseUrl, template) as E2BSandbox;
}

/**
 * Create a sandbox by type
 * @param type - Type of sandbox to create
 * @param options - Options for the sandbox (apiKey, baseUrl, etc.)
 */
export function createSandbox(
	type: SandboxConnectorType,
	options?: { apiKey?: string; baseUrl?: string; template?: string }
): Sandbox {
	switch (type) {
		case 'local':
			return createLocalSandbox();
		case 'virtual':
			return createVirtualSandbox();
		case 'daytona':
			if (!options?.apiKey) {
				throw new Error('API key required for Daytona sandbox');
			}
			return createDaytonaSandbox(options.apiKey, options.baseUrl);
		case 'e2b':
			if (!options?.apiKey) {
				throw new Error('API key required for E2B sandbox');
			}
			return createE2BSandbox(options.apiKey, options.baseUrl, options.template);
		default:
			throw new Error(`Unknown sandbox type: ${type}`);
	}
}
