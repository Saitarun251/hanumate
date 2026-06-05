/**
 * Orchestrator Agent
 *
 * Main agent that manages specialist agents, dispatches tasks, and collects results.
 * Demonstrates: registering multiple agents, dispatch() for handoffs, shared context.
 */

import { createAgent, init, type Harness, type RubberDuckAgent } from '@rubberduck/runtime';
import type { SubAgent, TaskResult, TaskContext } from './types.js';

// Shared context for agent-to-agent communication
export interface SharedContext {
	taskId: string;
	results: Map<string, TaskResult>;
	sharedData: Map<string, unknown>;
}

/**
 * Orchestrator class - manages multiple specialist agents
 */
export class Orchestrator {
	private registry: Map<string, SubAgent> = new Map();
	private activeHarnesses: Map<string, Harness> = new Map();
	private sharedContext: SharedContext;

	constructor() {
		this.sharedContext = {
			taskId: `task_${Date.now()}`,
			results: new Map(),
			sharedData: new Map(),
		};
	}

	/**
	 * Register a specialist agent with the orchestrator
	 * @param name - Agent identifier
	 * @param agent - RubberDuckAgent instance
	 * @param capabilities - List of capabilities this agent can handle
	 */
	registerAgent(name: string, agent: RubberDuckAgent, capabilities: string[]): void {
		const subAgent: SubAgent = {
			name,
			agent,
			capabilities,
			harness: null as unknown as Harness,
		};
		this.registry.set(name, subAgent);
		console.log(`[Orchestrator] Registered agent: ${name} with capabilities: ${capabilities.join(', ')}`);
	}

	/**
	 * Initialize all registered agents
	 */
	async initialize(): Promise<void> {
		console.log(`[Orchestrator] Initializing ${this.registry.size} agents...`);

		for (const [name, subAgent] of this.registry) {
			const harness = await init(subAgent.agent, {
				name: `orchestrator-${name}`,
			});
			subAgent.harness = harness;
			this.activeHarnesses.set(name, harness);
		}

		console.log(`[Orchestrator] All agents initialized`);
	}

	/**
	 * Dispatch a task to the appropriate specialist agent
	 * @param task - Task to dispatch
	 * @returns TaskResult from the specialist agent
	 */
	async dispatch(task: TaskContext): Promise<TaskResult> {
		const targetAgent = this.findAgentForTask(task.type);

		if (!targetAgent) {
			return {
				success: false,
				agentName: 'orchestrator',
				result: undefined,
				error: `No agent available for task type: ${task.type}`,
			};
		}

		console.log(`[Orchestrator] Dispatching task '${task.id}' (${task.type}) to ${targetAgent.name}`);

		try {
			const session = targetAgent.harness.session();
			const prompt = this.buildTaskPrompt(task, targetAgent);
			const response = await session.prompt(prompt);

			const result: TaskResult = {
				success: true,
				agentName: targetAgent.name,
				result: response,
				timestamp: Date.now(),
			};

			this.sharedContext.results.set(task.id, result);
			this.sharedContext.sharedData.set(`${task.type}_result`, response);

			return result;
		} catch (error) {
			console.error(`[Orchestrator] Task '${task.id}' failed:`, error);
			return {
				success: false,
				agentName: targetAgent.name,
				result: undefined,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Dispatch multiple tasks in parallel
	 * @param tasks - Array of tasks to execute concurrently
	 * @returns Array of results in same order as tasks
	 */
	async dispatchAll(tasks: TaskContext[]): Promise<TaskResult[]> {
		console.log(`[Orchestrator] Dispatching ${tasks.length} tasks in parallel...`);
		const results = await Promise.all(tasks.map((task) => this.dispatch(task)));
		console.log(`[Orchestrator] All ${tasks.length} tasks completed`);
		return results;
	}

	/**
	 * Dispatch multiple tasks sequentially
	 * @param tasks - Array of tasks to execute in order
	 * @returns Array of results in same order as tasks
	 */
	async dispatchSequential(tasks: TaskContext[]): Promise<TaskResult[]> {
		console.log(`[Orchestrator] Dispatching ${tasks.length} tasks sequentially...`);
		const results: TaskResult[] = [];

		for (const task of tasks) {
			const result = await this.dispatch(task);
			results.push(result);

			if (!result.success) {
				console.warn(`[Orchestrator] Task '${task.id}' failed, continuing...`);
			}
		}

		return results;
	}

	/**
	 * Find the best agent for a given task type
	 */
	private findAgentForTask(taskType: string): SubAgent | null {
		const capableAgents = Array.from(this.registry.values()).filter((agent) =>
			agent.capabilities.includes(taskType)
		);

		return capableAgents[0] || Array.from(this.registry.values())[0] || null;
	}

	/**
	 * Build prompt for a task
	 */
	private buildTaskPrompt(task: TaskContext, agent: SubAgent): string {
		const sharedData = this.getSharedDataSummary();

		let prompt = `Task: ${task.type}\nTask ID: ${task.id}\n\n`;

		if (task.payload.description) {
			prompt += `Description: ${task.payload.description}\n`;
		}

		if (task.payload.code) {
			prompt += `\nCode:\n\`\`\`\n${task.payload.code}\n\`\`\`\n`;
		}

		if (task.payload.language) {
			prompt += `\nLanguage: ${task.payload.language}\n`;
		}

		if (sharedData) {
			prompt += `\nContext from previous tasks:\n${sharedData}\n`;
		}

		prompt += `\nYou are acting as a ${agent.name} specialist. Execute the task and provide your findings.`;

		return prompt;
	}

	/**
	 * Get summary of shared context data
	 */
	private getSharedDataSummary(): string {
		const entries: string[] = [];
		for (const [key, value] of this.sharedContext.sharedData) {
			const preview = typeof value === 'string'
				? value.substring(0, 200) + (value.length > 200 ? '...' : '')
				: JSON.stringify(value).substring(0, 200);
			entries.push(`- ${key}: ${preview}`);
		}
		return entries.join('\n');
	}

	/**
	 * Get all collected results
	 */
	getResults(): Map<string, TaskResult> {
		return this.sharedContext.results;
	}

	/**
	 * Get a specific task result
	 */
	getResult(taskId: string): TaskResult | undefined {
		return this.sharedContext.results.get(taskId);
	}

	/**
	 * Get shared context data
	 */
	getSharedData(): Map<string, unknown> {
		return this.sharedContext.sharedData;
	}

	/**
	 * Shutdown all agent harnesses
	 */
	async shutdown(): Promise<void> {
		console.log('[Orchestrator] Shutting down all agents...');

		for (const [name, harness] of this.activeHarnesses) {
			try {
				await harness.shutdown();
				console.log(`[Orchestrator] Shut down agent: ${name}`);
			} catch (error) {
				console.error(`[Orchestrator] Error shutting down ${name}:`, error);
			}
		}

		this.activeHarnesses.clear();
		this.registry.clear();
	}
}

/**
 * Create orchestrator with default coder and reviewer agents
 */
export async function createOrchestrator(config?: {
	coderModel?: string;
	reviewerModel?: string;
}): Promise<Orchestrator> {
	const orchestrator = new Orchestrator();

	// Create coder agent
	const coderAgent = createAgent({
		name: 'coder',
		model: config?.coderModel ?? 'anthropic/claude-sonnet-4-6',
		skills: ['coding'],
	});

	// Create reviewer agent
	const reviewerAgent = createAgent({
		name: 'reviewer',
		model: config?.reviewerModel ?? 'anthropic/claude-sonnet-4-6',
		skills: ['code-review'],
	});

	// Register agents with capabilities
	orchestrator.registerAgent('coder', coderAgent, [
		'write_code',
		'refactor',
		'debug',
		'implement',
	]);

	orchestrator.registerAgent('reviewer', reviewerAgent, [
		'review_code',
		'check_quality',
		'suggest_improvements',
		'validate',
	]);

	await orchestrator.initialize();

	return orchestrator;
}