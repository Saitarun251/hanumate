/**
 * Shared Types for Orchestrator Pattern
 */

/**
 * A registered specialist agent
 */
export interface SubAgent {
	name: string;
	agent: import('@rubberduck/runtime').RubberDuckAgent;
	capabilities: string[];
	harness: import('@rubberduck/runtime').Harness;
}

/**
 * Task types that can be dispatched to specialists
 */
export type TaskType =
	| 'write_code'
	| 'review_code'
	| 'refactor'
	| 'debug'
	| 'check_quality'
	| 'suggest_improvements'
	| 'implement'
	| 'validate';

/**
 * Payload for a task
 */
export interface TaskPayload {
	description?: string;
	code?: string;
	files?: string[];
	language?: string;
	framework?: string;
	[key: string]: unknown;
}

/**
 * A task to be dispatched to a specialist agent
 */
export interface TaskContext {
	id: string;
	type: TaskType;
	payload: TaskPayload;
	priority?: 'low' | 'normal' | 'high';
	timeout?: number;
}

/**
 * Result from a task execution
 */
export interface TaskResult {
	success: boolean;
	agentName: string;
	result?: string;
	error?: string;
	timestamp?: number;
	metadata?: Record<string, unknown>;
}

/**
 * Workflow payload for development workflow
 */
export interface WorkflowPayload {
	task: string;
	code?: string;
	language?: string;
	framework?: string;
	files?: string[];
}