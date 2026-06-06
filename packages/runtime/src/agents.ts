/**
 * Agent Registry - Manages registered agents for subagent/orchestration system
 * 
 * Provides a centralized registry for managing multiple agents within a harness.
 * Supports registration, lookup, listing, and lifecycle management.
 */

import { type HanumateAgent, type HanumateConfig, createAgent } from './harness.js';

/**
 * Agent registration entry with metadata
 */
export interface AgentRegistration {
	/** Unique identifier for the agent */
	id: string;
	/** Agent instance */
	agent: HanumateAgent;
	/** Creation timestamp */
	createdAt: number;
	/** Optional display name override */
	name?: string;
	/** Agent capabilities/tags for routing */
	tags?: string[];
	/** Configuration used to create this agent */
	config: HanumateConfig;
}

/**
 * Agent registry options
 */
export interface AgentRegistryOptions {
	/** Default base path for agent skills */
	defaultBasePath?: string;
	/** Enable automatic agent cleanup on expiration */
	autoCleanup?: boolean;
	/** Cleanup interval in milliseconds */
	cleanupInterval?: number;
}

/**
 * Agent registry class for managing multiple agents
 * 
 * @example
 * ```typescript
 * const registry = new AgentRegistry();
 * 
 * // Register a new agent
 * registry.register('worker-1', { model: 'anthropic/claude-sonnet-4-6' });
 * 
 * // Get agent by ID
 * const agent = registry.get('worker-1');
 * 
 * // List all registered agent IDs
 * const ids = registry.list();
 * 
 * // Check if agent exists
 * if (registry.has('worker-1')) {
 *   registry.unregister('worker-1');
 * }
 * ```
 */
export class AgentRegistry {
	private agents: Map<string, AgentRegistration> = new Map();
	private readonly defaultBasePath?: string;
	private cleanupTimer?: ReturnType<typeof setInterval>;

	constructor(options?: AgentRegistryOptions) {
		this.defaultBasePath = options?.defaultBasePath;
		
		if (options?.autoCleanup) {
			const interval = options?.cleanupInterval ?? 60000;
			this.startCleanupTimer(interval);
		}
	}

	/**
	 * Register a new agent with the given ID
	 * 
	 * @param id - Unique identifier for the agent
	 * @param config - Agent configuration
	 * @param name - Optional display name
	 * @param tags - Optional capability tags
	 * @returns The created agent
	 */
	register(
		id: string,
		config: HanumateConfig,
		name?: string,
		tags?: string[]
	): HanumateAgent {
		if (this.agents.has(id)) {
			throw new Error(`Agent with ID '${id}' is already registered`);
		}

		// Create agent with config (optionally override base path)
		const effectiveConfig: HanumateConfig = {
			...config,
			basePath: config.basePath ?? this.defaultBasePath,
		};

		const agent = createAgent(effectiveConfig);

		const registration: AgentRegistration = {
			id,
			agent,
			createdAt: Date.now(),
			name,
			tags,
			config: effectiveConfig,
		};

		this.agents.set(id, registration);
		return agent;
	}

	/**
	 * Get an agent by ID
	 * 
	 * @param id - Agent identifier
	 * @returns The agent or undefined if not found
	 */
	get(id: string): HanumateAgent | undefined {
		return this.agents.get(id)?.agent;
	}

	/**
	 * Get full registration info for an agent
	 * 
	 * @param id - Agent identifier
	 * @returns Registration or undefined if not found
	 */
	getRegistration(id: string): AgentRegistration | undefined {
		return this.agents.get(id);
	}

	/**
	 * List all registered agent IDs
	 * 
	 * @returns Array of agent IDs
	 */
	list(): string[] {
		return Array.from(this.agents.keys());
	}

	/**
	 * Get all agent registrations
	 * 
	 * @returns Array of all registrations
	 */
	listRegistrations(): AgentRegistration[] {
		return Array.from(this.agents.values());
	}

	/**
	 * Check if an agent is registered
	 * 
	 * @param id - Agent identifier
	 * @returns True if agent exists
	 */
	has(id: string): boolean {
		return this.agents.has(id);
	}

	/**
	 * Unregister an agent
	 * 
	 * @param id - Agent identifier
	 * @returns The unregistered agent or undefined
	 */
	unregister(id: string): HanumateAgent | undefined {
		const registration = this.agents.get(id);
		if (registration) {
			this.agents.delete(id);
			return registration.agent;
		}
		return undefined;
	}

	/**
	 * Find agents by tag
	 * 
	 * @param tag - Tag to search for
	 * @returns Array of matching agent IDs
	 */
	findByTag(tag: string): string[] {
		const results: string[] = [];
		for (const [id, registration] of this.agents) {
			if (registration.tags?.includes(tag)) {
				results.push(id);
			}
		}
		return results;
	}

	/**
	 * Get the count of registered agents
	 */
	get size(): number {
		return this.agents.size;
	}

	/**
	 * Clear all registered agents
	 */
	clear(): void {
		this.agents.clear();
	}

	/**
	 * Update agent configuration
	 * 
	 * @param id - Agent identifier
	 * @param config - New configuration
	 * @returns Updated agent or undefined
	 */
	update(id: string, config: Partial<HanumateConfig>): HanumateAgent | undefined {
		const registration = this.agents.get(id);
		if (!registration) {
			return undefined;
		}

		// Create updated config
		const updatedConfig: HanumateConfig = {
			...registration.config,
			...config,
		};

		// Create new agent with updated config
		const agent = createAgent(updatedConfig);

		// Update registration
		registration.agent = agent;
		registration.config = updatedConfig;

		return agent;
	}

	/**
	 * Start the automatic cleanup timer
	 */
	private startCleanupTimer(intervalMs: number): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, intervalMs);
	}

	/**
	 * Clean up stale agents (placeholder for TTL-based cleanup)
	 */
	private cleanup(): void {
		// Future: Implement TTL-based cleanup for agents with expiration
		// For now, this is a placeholder that can be extended
	}

	/**
	 * Stop the cleanup timer
	 */
	stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}
}

// Re-export HanumateAgent for convenience
export type { HanumateAgent } from './harness.js';
export type { HanumateConfig } from './harness.js';