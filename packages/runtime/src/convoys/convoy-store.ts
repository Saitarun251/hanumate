/**
 * Convoy Store - JSON-based persistence for Convoys
 *
 * Stores convoy data in `.hanumate/convoys/` directory using JSON files.
 * Each convoy is stored as a separate JSON file named `{convoyId}.json`.
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { Convoy } from './convoy-types.js';

/**
 * Default directory for storing convoy data
 */
export const DEFAULT_CONVOYS_DIR = '.hanumate/convoys';

/**
 * Error class for convoy store errors
 */
export class ConvoyStoreError extends Error {
	constructor(
		message: string,
		public code: string,
		public convoyId?: string
	) {
		super(message);
		this.name = 'ConvoyStoreError';
	}
}

/**
 * Convoy Store - JSON-based persistence layer for convoys
 */
export class ConvoyStore {
	private readonly basePath: string;
	private initialized: boolean = false;

	constructor(basePath: string = DEFAULT_CONVOYS_DIR) {
		this.basePath = basePath;
	}

	/**
	 * Get the full path to a convoy file
	 */
	private getFilePath(convoyId: string): string {
		return join(this.basePath, `${convoyId}.json`);
	}

	/**
	 * Initialize the store by ensuring the directory exists
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			await mkdir(this.basePath, { recursive: true });
			this.initialized = true;
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			if (error.code !== 'EEXIST') {
				throw new ConvoyStoreError(
					`Failed to create convoys directory: ${error.message}`,
					error.code ?? 'UNKNOWN'
				);
			}
			this.initialized = true;
		}
	}

	/**
	 * Ensure the store is initialized
	 */
	private async ensureInit(): Promise<void> {
		if (!this.initialized) {
			await this.init();
		}
	}

	/**
	 * Save a convoy to disk
	 */
	async save(convoy: Convoy): Promise<void> {
		await this.ensureInit();

		const filePath = this.getFilePath(convoy.id);
		const content = JSON.stringify(convoy, null, 2);

		try {
			// Ensure parent directory exists
			const dir = dirname(filePath);
			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}

			// Write to temp file first, then rename for atomicity
			const tempPath = `${filePath}.tmp`;
			await writeFile(tempPath, content, { encoding: 'utf-8' });
			await writeFile(filePath, content, { encoding: 'utf-8' });

			// Clean up temp file
			try {
				await unlink(tempPath);
			} catch {
				// Ignore temp file cleanup errors
			}
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			throw new ConvoyStoreError(
				`Failed to save convoy ${convoy.id}: ${error.message}`,
				error.code ?? 'UNKNOWN',
				convoy.id
			);
		}
	}

	/**
	 * Load a convoy by ID
	 */
	async load(convoyId: string): Promise<Convoy | null> {
		await this.ensureInit();

		const filePath = this.getFilePath(convoyId);

		try {
			const content = await readFile(filePath, { encoding: 'utf-8' });
			const convoy = JSON.parse(content) as Convoy;
			return convoy;
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			if (error.code === 'ENOENT') {
				return null;
			}
			throw new ConvoyStoreError(
				`Failed to load convoy ${convoyId}: ${error.message}`,
				error.code ?? 'UNKNOWN',
				convoyId
			);
		}
	}

	/**
	 * Delete a convoy by ID
	 */
	async delete(convoyId: string): Promise<void> {
		await this.ensureInit();

		const filePath = this.getFilePath(convoyId);

		try {
			await unlink(filePath);
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			if (error.code === 'ENOENT') {
				// Already deleted, consider it a success
				return;
			}
			throw new ConvoyStoreError(
				`Failed to delete convoy ${convoyId}: ${error.message}`,
				error.code ?? 'UNKNOWN',
				convoyId
			);
		}
	}

	/**
	 * List all convoy IDs
	 */
	async listIds(): Promise<string[]> {
		await this.ensureInit();

		try {
			const files = await readdir(this.basePath);
			return files
				.filter((file) => file.endsWith('.json'))
				.map((file) => file.replace('.json', ''));
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException;
			if (error.code === 'ENOENT') {
				return [];
			}
			throw new ConvoyStoreError(
				`Failed to list convoys: ${error.message}`,
				error.code ?? 'UNKNOWN'
			);
		}
	}

	/**
	 * Load all convoys
	 */
	async loadAll(): Promise<Convoy[]> {
		const ids = await this.listIds();
		const convoys: Convoy[] = [];

		for (const id of ids) {
			const convoy = await this.load(id);
			if (convoy) {
				convoys.push(convoy);
			}
		}

		return convoys;
	}

	/**
	 * Check if a convoy exists
	 */
	async exists(convoyId: string): Promise<boolean> {
		const filePath = this.getFilePath(convoyId);
		try {
			await stat(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the storage directory path
	 */
	getStoragePath(): string {
		return this.basePath;
	}
}