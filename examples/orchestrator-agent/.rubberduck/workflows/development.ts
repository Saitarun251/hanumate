/**
 * Development Workflow
 *
 * Demonstrates orchestrator + subagent pattern:
 * 1. Orchestrator receives a development task
 * 2. Dispatches to coder agent to implement
 * 3. Dispatches to reviewer agent to review
 * 4. Collects and reports results
 */

import { createOrchestrator } from '../agents/orchestrator.js';
import type { TaskContext, TaskResult } from '../agents/types.js';

export interface DevelopmentPayload {
	task: string;
	code?: string;
	language?: string;
	framework?: string;
	files?: string[];
}

export interface DevelopmentResult {
	success: boolean;
	coderResult?: TaskResult;
	reviewerResult?: TaskResult;
	summary: string;
}

/**
 * Main development workflow
 */
export async function run(context: {
	init: (agent: import('@rubberduck/runtime').RubberDuckAgent, options?: unknown) => Promise<import('@rubberduck/runtime').Harness>;
	payload: unknown;
}): Promise<DevelopmentResult> {
	const payload = context.payload as DevelopmentPayload;

	console.log('[Development Workflow] Starting...');
	console.log(`[Development Workflow] Task: ${payload.task}`);

	const orchestrator = await createOrchestrator({
		coderModel: 'anthropic/claude-sonnet-4-6',
		reviewerModel: 'anthropic/claude-sonnet-4-6',
	});

	try {
		// Step 1: Dispatch to coder
		console.log('\n[Development Workflow] Step 1: Dispatching to coder...');

		const codingTask: TaskContext = {
			id: `coding_${Date.now()}`,
			type: 'write_code',
			payload: {
				description: payload.task,
				code: payload.code,
				language: payload.language,
				framework: payload.framework,
			},
			priority: 'high',
		};

		const coderResult = await orchestrator.dispatch(codingTask);
		console.log(`[Development Workflow] Coder: ${coderResult.success ? 'success' : 'failed'}`);

		// Step 2: Dispatch to reviewer
		console.log('\n[Development Workflow] Step 2: Dispatching to reviewer...');

		const reviewTask: TaskContext = {
			id: `review_${Date.now()}`,
			type: 'review_code',
			payload: {
				description: `Review implementation for: ${payload.task}`,
				code: coderResult.result,
				language: payload.language,
			},
			priority: 'normal',
		};

		const reviewerResult = await orchestrator.dispatch(reviewTask);
		console.log(`[Development Workflow] Reviewer: ${reviewerResult.success ? 'success' : 'failed'}`);

		// Step 3: Build summary
		console.log('\n[Development Workflow] Step 3: Building summary...');

		const summary = buildSummary(coderResult, reviewerResult, payload.task);

		return {
			success: coderResult.success && reviewerResult.success,
			coderResult,
			reviewerResult,
			summary,
		};
	} finally {
		await orchestrator.shutdown();
		console.log('[Development Workflow] Orchestrator shut down');
	}
}

/**
 * Build summary from results
 */
function buildSummary(coderResult: TaskResult, reviewerResult: TaskResult, task: string): string {
	let summary = `# Development Workflow Summary\n\n`;
	summary += `Task: ${task}\n\n`;
	summary += `## Coder Agent\n`;
	summary += `Status: ${coderResult.success ? 'Completed successfully' : 'Failed'}\n`;
	if (coderResult.success && coderResult.result) {
		summary += `Result preview: ${truncate(coderResult.result, 500)}\n`;
	} else if (coderResult.error) {
		summary += `Error: ${coderResult.error}\n`;
	}
	summary += `\n## Reviewer Agent\n`;
	summary += `Status: ${reviewerResult.success ? 'Completed successfully' : 'Failed'}\n`;
	if (reviewerResult.success && reviewerResult.result) {
		summary += `Review preview: ${truncate(reviewerResult.result, 500)}\n`;
	} else if (reviewerResult.error) {
		summary += `Error: ${reviewerResult.error}\n`;
	}
	summary += `\n## Overall\n`;
	summary += `Workflow completed with both agents. Check individual results for details.`;

	return summary;
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
	if (!text || text.length <= maxLength) {
		return text || '';
	}
	return text.substring(0, maxLength) + '...';
}

/**
 * Parallel workflow - run coding and testing simultaneously
 */
export async function runParallel(context: {
	init: (agent: import('@rubberduck/runtime').RubberDuckAgent, options?: unknown) => Promise<import('@rubberduck/runtime').Harness>;
	payload: unknown;
}): Promise<{ codingResult: TaskResult; testingResult: TaskResult }> {
	const payload = context.payload as DevelopmentPayload;

	const orchestrator = await createOrchestrator();

	try {
		const tasks: TaskContext[] = [
			{
				id: `coding_${Date.now()}`,
				type: 'write_code',
				payload: { description: payload.task, language: payload.language },
			},
			{
				id: `implement`,
				type: 'implement',
				payload: { description: `Write tests for: ${payload.task}`, language: payload.language },
			},
		];

		const results = await orchestrator.dispatchAll(tasks);

		return {
			codingResult: results[0],
			testingResult: results[1],
		};
	} finally {
		await orchestrator.shutdown();
	}
}

/**
 * Sequential workflow with shared context
 */
export async function runWithContext(context: {
	init: (agent: import('@rubberduck/runtime').RubberDuckAgent, options?: unknown) => Promise<import('@rubberduck/runtime').Harness>;
	payload: unknown;
}): Promise<{ results: TaskResult[]; sharedContext: string }> {
	const payload = context.payload as DevelopmentPayload;

	const orchestrator = await createOrchestrator();

	try {
		// Step 1: Analyze
		const analysisTask: TaskContext = {
			id: `analysis_${Date.now()}`,
			type: 'check_quality',
			payload: { description: `Analyze requirements: ${payload.task}` },
		};

		await orchestrator.dispatch(analysisTask);

		// Step 2: Code with context
		const codingTask: TaskContext = {
			id: `coding_${Date.now()}`,
			type: 'write_code',
			payload: {
				description: payload.task,
				language: payload.language,
				framework: payload.framework,
			},
		};

		const codingResult = await orchestrator.dispatch(codingTask);

		// Step 3: Review with context
		const reviewTask: TaskContext = {
			id: `review_${Date.now()}`,
			type: 'review_code',
			payload: {
				description: `Final review for: ${payload.task}`,
				code: codingResult.result,
				language: payload.language,
			},
		};

		const reviewResult = await orchestrator.dispatch(reviewTask);

		const allResults = Array.from(orchestrator.getResults().values());
		const sharedContext = buildContextSummary(allResults, payload.task);

		return {
			results: allResults,
			sharedContext,
		};
	} finally {
		await orchestrator.shutdown();
	}
}

/**
 * Build context summary
 */
function buildContextSummary(results: TaskResult[], task: string): string {
	let summary = `# Shared Context Summary\n\n`;
	summary += `Original Task: ${task}\n\n`;
	summary += `## Results\n`;

	for (const result of results) {
		summary += `\n### ${result.agentName}\n`;
		summary += `Status: ${result.success ? 'Success' : 'Failed'}\n`;
		if (result.result) {
			summary += `Preview: ${truncate(result.result, 200)}\n`;
		}
	}

	return summary;
}