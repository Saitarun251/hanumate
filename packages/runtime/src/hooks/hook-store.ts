/**
 * Hook Store - JSON-based persistence for hooks
 * 
 * Provides persistent storage for hooks in .rubberduck/hooks/ directory.
 * Hooks are stored as individual JSON files for git-backup compatibility.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Hook, HookStatus, HookStore as HookStoreInterface } from './hook-types.js';

/**
 * JSON file-based hook store
 * 
 * Stores hooks as individual JSON files in the specified directory,
 * enabling git-backup and easy inspection of hook state.
 */
export class HookStore implements HookStoreInterface {
	private readonly hooksDir: string;
	private readonly ensureDir: () => Promise<void>;

	/**
	 * Create a new HookStore
	 * @param hooksDir - Directory to store hook JSON files (default: .rubberduck/hooks)
	 */
	constructor(hooksDir?: string) {
		this.hooksDir = hooksDir ?? '.rubberduck/hooks';
		this.ensureDir = async (): Promise<void> => {
			if (!existsSync(this.hooksDir)) {
				await mkdir(this.hooksDir, { recursive: true });
			}
		};
	}

	/**
	 * Get the file path for a hook
	 */
	private getHookPath(hookId: string): string {
		return join(this.hooksDir, `${hookId}.json`);
	}

	/**
	 * Save a hook to disk
	 */
	async save(hook: Hook): Promise<void> {
		await this.ensureDir();
		const filePath = this.getHookPath(hook.id);
		const content = JSON.stringify(hook, null, 2);
		await writeFile(filePath, content, { encoding: 'utf-8' });
	}

	/**
	 * Load a hook by ID from disk
	 */
	async load(hookId: string): Promise<Hook | null> {
		const filePath = this.getHookPath(hookId);
		
		if (!existsSync(filePath)) {
			return null;
		}
		
		try {
			const content = await readFile(filePath, { encoding: 'utf-8' });
			const hook = JSON.parse(content) as Hook;
			return hook;
		} catch {
			return null;
		}
	}

	/**
	 * Load hook by agent ID
	 */
	async loadByAgentId(agentId: string): Promise<Hook | null> {
		const hooks = await this.list();
		return hooks.find((h) => h.agentId === agentId) ?? null;
	}

	/**
	 * List all hooks from disk
	 */
	async list(): Promise<Hook[]> {
		await this.ensureDir();
		
		try {
			const files = await readdir(this.hooksDir);
			const hookFiles = files.filter((f) => f.endsWith('.json'));
			
			const hooks: Hook[] = [];
			for (const file of hookFiles) {
				const filePath = join(this.hooksDir, file);
				try {
					const content = await readFile(filePath, { encoding: 'utf-8' });
					const hook = JSON.parse(content) as Hook;
					hooks.push(hook);
				} catch {
					// Skip invalid files
					continue;
				}
			}
			
			return hooks;
		} catch {
			return [];
		}
	}

	/**
	 * List hooks by status
	 */
	async listByStatus(status: HookStatus): Promise<Hook[]> {
		const hooks = await this.list();
		return hooks.filter((h) => h.status === status);
	}

	/**
	 * Delete a hook from disk
	 */
	async delete(hookId: string): Promise<void> {
		const filePath = this.getHookPath(hookId);
		
		if (existsSync(filePath)) {
			await unlink(filePath);
		}
	}

	/**
	 * Pop work for an agent (GUPP principle)
	 * 
	 * Returns and removes the next pending hook for the specified agent.
	 * This implements the GUPP principle: "If work is on your Hook, you run it."
	 */
	async popWork(agentId: string): Promise<Hook | null> {
		const hooks = await this.list();
		
		// Find the oldest pending hook for this agent
		const pendingHook = hooks
			.filter((h) => h.agentId === agentId && h.status === 'pending')
			.sort((a, b) => a.assignedAt - b.assignedAt)[0];
		
		if (!pendingHook) {
			return null;
		}
		
		// Update status to active and save
		const updatedHook: Hook = {
			...pendingHook,
			status: 'active',
			startedAt: Date.now(),
		};
		
		await this.save(updatedHook);
		
		return updatedHook;
	}

	/**
	 * Update hook status
	 */
	async updateStatus(hookId: string, status: HookStatus): Promise<void> {
		const hook = await this.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status,
		};
		
		if (status === 'completed') {
			updatedHook.completedAt = Date.now();
		}
		
		await this.save(updatedHook);
	}

	/**
	 * Update hook progress
	 */
	async updateProgress(hookId: string, progress: number): Promise<void> {
		const hook = await this.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			progress: Math.min(100, Math.max(0, progress)),
		};
		
		await this.save(updatedHook);
	}

	/**
	 * Record heartbeat for a hook
	 */
	async heartbeat(hookId: string): Promise<void> {
		const hook = await this.load(hookId);
		
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			lastHeartbeat: Date.now(),
		};
		
		await this.save(updatedHook);
	}
}

/**
 * In-memory hook store for testing
 */
export class InMemoryHookStore implements HookStoreInterface {
	private hooks: Map<string, Hook> = new Map();

	async save(hook: Hook): Promise<void> {
		this.hooks.set(hook.id, { ...hook });
	}

	async load(hookId: string): Promise<Hook | null> {
		return this.hooks.get(hookId) ?? null;
	}

	async loadByAgentId(agentId: string): Promise<Hook | null> {
		for (const hook of this.hooks.values()) {
			if (hook.agentId === agentId) {
				return hook;
			}
		}
		return null;
	}

	async list(): Promise<Hook[]> {
		return Array.from(this.hooks.values());
	}

	async listByStatus(status: HookStatus): Promise<Hook[]> {
		return Array.from(this.hooks.values()).filter((h) => h.status === status);
	}

	async delete(hookId: string): Promise<void> {
		this.hooks.delete(hookId);
	}

	async popWork(agentId: string): Promise<Hook | null> {
		const pendingHooks = Array.from(this.hooks.values())
			.filter((h) => h.agentId === agentId && h.status === 'pending')
			.sort((a, b) => a.assignedAt - b.assignedAt);
		
		if (pendingHooks.length === 0) {
			return null;
		}
		
		const hook = pendingHooks[0];
		const updatedHook: Hook = {
			...hook,
			status: 'active',
			startedAt: Date.now(),
		};
		
		this.hooks.set(hook.id, updatedHook);
		return updatedHook;
	}

	async updateStatus(hookId: string, status: HookStatus): Promise<void> {
		const hook = this.hooks.get(hookId);
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			status,
			completedAt: status === 'completed' ? Date.now() : hook.completedAt,
		};
		
		this.hooks.set(hookId, updatedHook);
	}

	async updateProgress(hookId: string, progress: number): Promise<void> {
		const hook = this.hooks.get(hookId);
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			progress: Math.min(100, Math.max(0, progress)),
		};
		
		this.hooks.set(hookId, updatedHook);
	}

	async heartbeat(hookId: string): Promise<void> {
		const hook = this.hooks.get(hookId);
		if (!hook) {
			throw new Error(`Hook not found: ${hookId}`);
		}
		
		const updatedHook: Hook = {
			...hook,
			lastHeartbeat: Date.now(),
		};
		
		this.hooks.set(hookId, updatedHook);
	}
}