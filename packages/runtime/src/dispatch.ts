/**
 * Dispatch System - Orchestrates work across multiple agents
 */

import type { HanumateAgent } from './harness.js';
import { AgentRegistry } from './agents.js';

/**
 * Dispatch target - can be an agent ID or agent instance
 */
export type DispatchTarget = string | HanumateAgent;

/**
 * Dispatch options for single dispatch
 */
export interface DispatchOptions {
	/** Target agent ID or instance */
	target: DispatchTarget;
	/** Task/prompt to send to the agent */
	task: string;
	/** Timeout for dispatch in milliseconds (default: 30000) */
	timeout?: number;
	/** Include metadata in results */
	includeMetadata?: boolean;
}

/**
 * Single dispatch result
 */
export interface DispatchResult {
	/** Unique result identifier */
	id: string;
	/** Target identifier (agent ID or name) */
	target: string;
	/** Success status */
	success: boolean;
	/** Result data or error */
	data?: unknown;
	/** Error if unsuccessful */
	error?: string;
	/** Execution duration in milliseconds */
	duration: number;
	/** Timestamp of completion */
	completedAt: number;
}

/**
 * Batch dispatch result for multi-agent dispatch
 */
export interface BatchDispatchResult {
	/** All results from dispatch */
	results: DispatchResult[];
	/** Overall success status */
	success: boolean;
	/** Combined data from all successful dispatches */
	combinedData?: unknown[];
	/** Array of errors from failed dispatches */
	errors: Array<{ target: string; error: string }>;
	/** Total execution duration */
	totalDuration: number;
}

/**
 * Dispatcher class for orchestrating agent work
 */
export class Dispatcher {
	private agentRegistry: AgentRegistry;

	constructor(agentRegistry: AgentRegistry) {
		this.agentRegistry = agentRegistry;
	}

	/**
	 * Dispatch to a single agent
	 */
	async dispatch(options: DispatchOptions): Promise<DispatchResult> {
		const startTime = Date.now();
		const timeout = options?.timeout ?? 30000;
		const includeMetadata = options?.includeMetadata ?? true;

		// Resolve target to agent
		const targetId = typeof options.target === 'string' ? options.target : options.target.name;
		let agent: HanumateAgent | undefined;

		if (typeof options.target === 'string') {
			agent = this.agentRegistry.get(options.target);
			if (!agent) {
				return this.createErrorResult(
					`disp_${startTime}_${Math.random().toString(36).substring(2, 9)}`,
					targetId,
					`Agent '${options.target}' not found`,
					startTime
				);
			}
		} else {
			agent = options.target;
		}

		try {
			const result = await this.executeWithTimeout(agent, options.task, timeout);
			return {
				id: `disp_${startTime}_${Math.random().toString(36).substring(2, 9)}`,
				target: targetId,
				success: true,
				data: result,
				duration: includeMetadata ? Date.now() - startTime : 0,
				completedAt: includeMetadata ? Date.now() : 0,
			};
		} catch (error) {
			return this.createErrorResult(
				`disp_${startTime}_${Math.random().toString(36).substring(2, 9)}`,
				targetId,
				error instanceof Error ? error.message : String(error),
				startTime
			);
		}
	}

	/**
	 * Dispatch to multiple agents in parallel
	 */
	async dispatchAsync(
		targets: DispatchTarget[],
		task: string,
		options?: { timeout?: number; includeMetadata?: boolean }
	): Promise<BatchDispatchResult> {
		const startTime = Date.now();

		const dispatchPromises = targets.map((target) =>
			this.dispatch({
				target,
				task,
				timeout: options?.timeout,
				includeMetadata: options?.includeMetadata,
			})
		);

		const results = await Promise.all(dispatchPromises);
		return this.createBatchResult(results, startTime);
	}

	/**
	 * Dispatch to multiple agents sequentially
	 */
	async dispatchSequential(
		targets: DispatchTarget[],
		task: string,
		options?: { timeout?: number; includeMetadata?: boolean }
	): Promise<BatchDispatchResult> {
		const startTime = Date.now();
		const results: DispatchResult[] = [];

		for (const target of targets) {
			const result = await this.dispatch({
				target,
				task,
				timeout: options?.timeout,
				includeMetadata: options?.includeMetadata,
			});
			results.push(result);
		}

		return this.createBatchResult(results, startTime);
	}

	private async executeWithTimeout(
		agent: HanumateAgent,
		task: string,
		timeout: number
	): Promise<unknown> {
		return new Promise<unknown>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`Dispatch timeout after ${timeout}ms`));
			}, timeout);

			Promise.resolve()
				.then(() => {
					clearTimeout(timeoutId);
					resolve({
						response: `[Simulated response from ${agent.name} for: ${task.substring(0, 50)}...]`,
						agent: agent.name,
						timestamp: Date.now(),
					});
				})
				.catch((err) => {
					clearTimeout(timeoutId);
					reject(err);
				});
		});
	}

	private createErrorResult(
		id: string,
		target: string,
		error: string,
		startTime: number
	): DispatchResult {
		return {
			id,
			target,
			success: false,
			error,
			duration: Date.now() - startTime,
			completedAt: Date.now(),
		};
	}

	private createBatchResult(results: DispatchResult[], startTime: number): BatchDispatchResult {
		const errors = results
			.filter((r) => !r.success)
			.map((r) => ({ target: r.target, error: r.error ?? 'Unknown error' }));
		const successfulResults = results.filter((r) => r.success);
		const combinedData = successfulResults.map((r) => r.data);

		return {
			results,
			success: errors.length === 0,
			combinedData: combinedData.length > 0 ? combinedData : undefined,
			errors,
			totalDuration: Date.now() - startTime,
		};
	}
}

/**
 * Simple dispatch function
 */
export async function dispatch(
	registry: AgentRegistry,
	options: DispatchOptions
): Promise<DispatchResult> {
	const dispatcher = new Dispatcher(registry);
	return dispatcher.dispatch(options);
}

/**
 * Simple parallel dispatch function
 */
export async function dispatchAsync(
	registry: AgentRegistry,
	targets: DispatchTarget[],
	task: string,
	options?: { timeout?: number; includeMetadata?: boolean }
): Promise<BatchDispatchResult> {
	const dispatcher = new Dispatcher(registry);
	return dispatcher.dispatchAsync(targets, task, options);
}

/**
 * Simple sequential dispatch function
 */
export async function dispatchSequential(
	registry: AgentRegistry,
	targets: DispatchTarget[],
	task: string,
	options?: { timeout?: number; includeMetadata?: boolean }
): Promise<BatchDispatchResult> {
	const dispatcher = new Dispatcher(registry);
	return dispatcher.dispatchSequential(targets, task, options);
}