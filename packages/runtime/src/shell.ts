/**
 * Shell execution module using node:child_process
 * Provides real shell command execution with timeout and streaming support
 */

import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
}

export interface ExecOptions {
	/** Working directory for the command */
	cwd?: string;
	/** Environment variables (merged with process.env) */
	env?: Record<string, string>;
	/** Timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Maximum output size in bytes before streaming (default: 1MB) */
	maxOutput?: number;
	/** Shell to use (default: /bin/sh on Unix, cmd.exe on Windows) */
	shell?: string;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1MB

/**
 * Execute a shell command and return stdout, stderr, and exit code
 */
export async function exec(
	command: string,
	cwd?: string,
	options?: ExecOptions
): Promise<ExecResult> {
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
	const maxOutput = options?.maxOutput ?? DEFAULT_MAX_OUTPUT;
	const shell = options?.shell ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');

	// Build environment - inherit process.env and merge custom vars
	const env: Record<string, string> = {
		...process.env,
		...options?.env,
	} as Record<string, string>;

	const { shell: _shell, ...restOptions } = {
		cwd: cwd ?? process.cwd(),
		env,
		stdio: ['ignore', 'pipe', 'pipe'] as const,
	};

	return new Promise((resolve) => {
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let killed = false;

		const child = spawn(shell, ['-c', command], restOptions);

		// Set up timeout
		const timeoutId = setTimeout(() => {
			timedOut = true;
			killed = true;
			child.kill('SIGTERM');
			// Force kill after 5 seconds if still running
			setTimeout(() => {
				if (!child.killed) {
					child.kill('SIGKILL');
				}
			}, 5000);
		}, timeout);

		// Handle stdout
		child.stdout?.on('data', (data: Buffer) => {
			const chunk = data.toString();
			if (stdout.length + chunk.length > maxOutput && !timedOut) {
				stdout += chunk.substring(0, maxOutput - stdout.length);
				stderr += `\n[Output truncated: exceeded ${maxOutput} bytes]\n`;
				child.kill();
				return;
			}
			stdout += chunk;
		});

		// Handle stderr
		child.stderr?.on('data', (data: Buffer) => {
			const chunk = data.toString();
			if (stderr.length + chunk.length > maxOutput && !timedOut) {
				stderr += chunk.substring(0, maxOutput - stderr.length);
				return;
			}
			stderr += chunk;
		});

		child.on('close', (code) => {
			clearTimeout(timeoutId);
			resolve({
				stdout,
				stderr,
				exitCode: code,
				timedOut,
			});
		});

		child.on('error', (err) => {
			clearTimeout(timeoutId);
			resolve({
				stdout,
				stderr: stderr + `\nError: ${err.message}`,
				exitCode: null,
				timedOut,
			});
		});
	});
}

/**
 * Execute a shell command with streaming output
 * Useful for long-running commands with large output
 */
export function execStream(
	command: string,
	cwd?: string,
	options?: ExecOptions,
	callbacks?: {
		onStdout?: (data: string) => void;
		onStderr?: (data: string) => void;
		onClose?: (code: number | null) => void;
		onError?: (err: Error) => void;
	}
): { kill: () => void } {
	const shell = options?.shell ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');

	const env: Record<string, string> = {
		...process.env,
		...options?.env,
	} as Record<string, string>;

	const child = spawn(shell, ['-c', command], {
		cwd: cwd ?? process.cwd(),
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	child.stdout?.on('data', (data: Buffer) => {
		callbacks?.onStdout?.(data.toString());
	});

	child.stderr?.on('data', (data: Buffer) => {
		callbacks?.onStderr?.(data.toString());
	});

	if (callbacks?.onClose) {
		child.on('close', callbacks.onClose);
	}
	if (callbacks?.onError) {
		child.on('error', callbacks.onError);
	}

	return {
		kill: () => child.kill(),
	};
}

/**
 * Get the system default environment variables
 */
export function getDefaultEnv(): Record<string, string> {
	return {
		PATH: process.env.PATH ?? '',
		HOME: process.env.HOME ?? '',
		USER: process.env.USER ?? '',
		SHELL: process.env.SHELL ?? '',
		PWD: process.cwd(),
		LANG: process.env.LANG ?? 'en_US.UTF-8',
		...process.env,
	};
}
