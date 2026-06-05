/**
 * Filesystem operations module using node:fs
 * Provides real filesystem operations with proper error handling
 */

import { readFile, writeFile, readdir, mkdir, stat, copyFile, unlink, rmdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, basename, dirname, extname, isAbsolute } from 'node:path';
import type { Stats } from 'node:fs';

export interface FileInfo {
	path: string;
	name: string;
	isDirectory: boolean;
	isFile: boolean;
	size: number;
	modified: Date;
	created: Date;
}

export interface ReadOptions {
	encoding?: BufferEncoding;
	limit?: number;
	offset?: number;
}

export interface WriteOptions {
	encoding?: BufferEncoding;
	flag?: string;
	mode?: number;
}

export interface GlobOptions {
	pattern?: string; // Pattern to match (e.g., "*.ts", "**/*.js")
	includeHidden?: boolean; // Include hidden files
	maxDepth?: number; // Maximum depth for recursive glob
	cwd?: string; // Working directory for glob
}

/**
 * Custom error class for filesystem errors
 */
export class FSError extends Error {
	constructor(
		message: string,
		public code: string,
		public path?: string
	) {
		super(message);
		this.name = 'FSError';
	}
}

/**
 * Read a file and return its contents
 */
export async function read(
	path: string,
	options?: ReadOptions
): Promise<string | Buffer> {
	try {
		const encoding = options?.encoding ?? 'utf-8';
		const limit = options?.limit;
		const offset = options?.offset;

		if (limit !== undefined || offset !== undefined) {
			// Partial read
			const buffer = await readFile(path);
			const start = offset ?? 0;
			const end = limit !== undefined ? start + limit : buffer.length;
			return buffer.slice(start, end).toString(encoding);
		}

		return await readFile(path, { encoding });
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`File not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		if (error.code === 'EISDIR') {
			throw new FSError(`Path is a directory: ${path}`, 'EISDIR', path);
		}
		throw err;
	}
}

/**
 * Write content to a file
 */
export async function write(
	path: string,
	content: string | Buffer,
	options?: WriteOptions
): Promise<void> {
	try {
		const encoding = options?.encoding ?? 'utf-8';
		const flag = options?.flag ?? 'w';
		const mode = options?.mode ?? 0o644;

		await writeFile(path, content, { encoding, flag, mode });
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			// Try to create parent directories
			const parentDir = dirname(path);
			if (!existsSync(parentDir)) {
				await mkdir(parentDir, { recursive: true });
				return write(path, content, options);
			}
			throw new FSError(`File not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		if (error.code === 'EPERM') {
			throw new FSError(`Operation not permitted: ${path}`, 'EPERM', path);
		}
		throw err;
	}
}

/**
 * Create a directory
 */
export async function mk(
	path: string,
	options?: { recursive?: boolean; mode?: number }
): Promise<string | undefined> {
	try {
		return await mkdir(path, {
			recursive: options?.recursive ?? true,
			mode: options?.mode ?? 0o755,
		});
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'EEXIST') {
			return undefined; // Directory already exists
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		throw err;
	}
}

/**
 * Read directory contents
 */
export async function readDir(
	path: string,
	options?: { withFileTypes?: boolean }
): Promise<string[] | FileInfo[]> {
	try {
		const entries = await readdir(path, { withFileTypes: true });

		if (options?.withFileTypes) {
			const results: FileInfo[] = await Promise.all(
				entries.map(async (entry) => {
					const fullPath = join(path, entry.name);
					const stats = await stat(fullPath);
					return {
						path: fullPath,
						name: entry.name,
						isDirectory: entry.isDirectory(),
						isFile: entry.isFile(),
						size: stats.size,
						modified: stats.mtime,
						created: stats.birthtime,
					};
				})
			);
			return results;
		}

		return entries.map((entry) => entry.name);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`Directory not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		if (error.code === 'ENOTDIR') {
			throw new FSError(`Not a directory: ${path}`, 'ENOTDIR', path);
		}
		throw err;
	}
}

/**
 * Get file/directory stats
 */
export async function getStats(path: string): Promise<Stats> {
	try {
		return await stat(path);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`Path not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		throw err;
	}
}

/**
 * Check if path exists
 */
export function exists(path: string): boolean {
	return existsSync(path);
}

/**
 * Copy a file
 */
export async function copy(src: string, dest: string): Promise<void> {
	try {
		await copyFile(src, dest);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`Source file not found: ${src}`, 'ENOENT', src);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${dest}`, 'EACCES', dest);
		}
		throw err;
	}
}

/**
 * Delete a file
 */
export async function remove(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`File not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		if (error.code === 'EPERM') {
			throw new FSError(`Operation not permitted: ${path}`, 'EPERM', path);
		}
		throw err;
	}
}

/**
 * Remove an empty directory
 */
export async function removeDir(path: string): Promise<void> {
	try {
		await rmdir(path);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`Directory not found: ${path}`, 'ENOENT', path);
		}
		if (error.code === 'ENOTEMPTY') {
			throw new FSError(`Directory not empty: ${path}`, 'ENOTEMPTY', path);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied: ${path}`, 'EACCES', path);
		}
		throw err;
	}
}

/**
 * Rename/move a file or directory
 */
export async function move(src: string, dest: string): Promise<void> {
	try {
		await rename(src, dest);
	} catch (err: unknown) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOENT') {
			throw new FSError(`Source not found: ${src}`, 'ENOENT', src);
		}
		if (error.code === 'EACCES') {
			throw new FSError(`Permission denied`, 'EACCES');
		}
		if (error.code === 'EXDEV') {
			throw new FSError(`Cross-device move not supported`, 'EXDEV');
		}
		throw err;
	}
}

/**
 * Glob pattern matching for files
 * Supports: *, **, ?, character classes
 */
export async function glob(
	basePath: string,
	options?: GlobOptions
): Promise<string[]> {
	const pattern = options?.pattern ?? '**/*';
	const includeHidden = options?.includeHidden ?? false;
	const maxDepth = options?.maxDepth ?? Infinity;
	const cwd = options?.cwd ?? basePath;

	const results: string[] = [];

	// Check if pattern contains ** for recursive matching
	const hasRecursivePattern = pattern.includes('**');

	// Convert glob pattern to regex
	const globToRegex = (glob: string): RegExp => {
		let regexStr = glob
			.replace(/[.+^${}()|[\]\\]/g, '\\$&');

		// Handle ** before * to avoid double conversion
		regexStr = regexStr.replace(/\*\*/g, '{{DOUBLE_STAR}}');
		regexStr = regexStr.replace(/\*/g, '[^/]*');
		regexStr = regexStr.replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
		regexStr = regexStr.replace(/\?/g, '[^/]');

		return new RegExp(`^${regexStr}$`);
	};

	const regex = globToRegex(pattern);

	// Recursive directory traversal
	const traverse = async (dir: string, depth: number): Promise<void> => {
		if (depth > maxDepth) return;

		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				// Skip hidden files unless specified
				if (!includeHidden && entry.name.startsWith('.')) {
					continue;
				}

				const fullPath = join(dir, entry.name);
				const relativePath = relative(cwd, fullPath);

				// For ** patterns, always include all files/directories
				// For other patterns, check if matches
				let matches = hasRecursivePattern || regex.test(relativePath) || regex.test(entry.name);

				if (matches) {
					results.push(fullPath);
				}

				// Recurse into directories
				if (entry.isDirectory()) {
					await traverse(fullPath, depth + 1);
				}
			}
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			if (error.code === 'EACCES') {
				// Skip directories we can't read
				return;
			}
			throw err;
		}
	};

	await traverse(cwd, 0);
	return results;
}

/**
 * Resolve path to absolute
 */
export function resolvePath(...paths: string[]): string {
	return resolve(...paths);
}

/**
 * Join path segments
 */
export function joinPath(...paths: string[]): string {
	return join(...paths);
}

/**
 * Get relative path
 */
export function relativePath(from: string, to: string): string {
	return relative(from, to);
}

/**
 * Get file/directory name
 */
export function fileName(path: string): string {
	return basename(path);
}

/**
 * Get directory name
 */
export function dirName(path: string): string {
	return dirname(path);
}

/**
 * Get file extension
 */
export function fileExt(path: string): string {
	return extname(path);
}

/**
 * Check if path is absolute
 */
export function isAbs(path: string): boolean {
	return isAbsolute(path);
}
