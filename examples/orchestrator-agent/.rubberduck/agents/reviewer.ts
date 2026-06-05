/**
 * Reviewer Specialist Agent
 *
 * Specializes in code review, quality checks, and suggestions.
 */

import { createAgent, type RubberDuckAgent } from '@rubberduck/runtime';
import type { TaskContext, TaskResult } from './types.js';

/**
 * Create a reviewer agent
 */
export function createReviewerAgent(config?: {
	model?: string;
	skills?: string[];
}): RubberDuckAgent {
	return createAgent({
		name: 'reviewer',
		model: config?.model ?? 'anthropic/claude-sonnet-4-6',
		skills: config?.skills ?? ['code-review', 'quality'],
	});
}

/**
 * Execute a review task
 */
export async function executeReviewTask(
	harness: import('@rubberduck/runtime').Harness,
	task: TaskContext,
	previousResults?: Map<string, TaskResult>
): Promise<TaskResult> {
	const session = harness.session();

	try {
		const prompt = buildReviewPrompt(task, previousResults);
		const response = await session.prompt(prompt);

		return {
			success: true,
			agentName: 'reviewer',
			result: response,
			timestamp: Date.now(),
			metadata: {
				taskId: task.id,
				taskType: task.type,
				hasPreviousResults: !!previousResults && previousResults.size > 0,
			},
		};
	} catch (error) {
		return {
			success: false,
			agentName: 'reviewer',
			result: undefined,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Build review prompt from task context and previous results
 */
function buildReviewPrompt(
	task: TaskContext,
	previousResults?: Map<string, TaskResult>
): string {
	const payload = task.payload;

	let prompt = `You are a code review specialist. Review the following code and provide feedback:\n\n`;

	if (payload.description) {
		prompt += `Review Context: ${payload.description}\n\n`;
	}

	if (payload.code) {
		prompt += `Code to Review:\n\`\`\`\n${payload.code}\n\`\`\`\n`;
	}

	if (payload.language) {
		prompt += `Language: ${payload.language}\n`;
	}

	// Include context from previous tasks (e.g., from coder)
	if (previousResults && previousResults.size > 0) {
		prompt += `\nContext from Previous Tasks:\n`;
		for (const [taskId, result] of previousResults) {
			if (result.success && result.result) {
				prompt += `\n--- Task ${taskId} (from ${result.agentName}) ---\n`;
				const truncatedResult = result.result.substring(0, 1000);
				prompt += truncatedResult + (result.result.length > 1000 ? '\n...(truncated)' : '');
				prompt += `\n`;
			}
		}
		prompt += `\n`;
	}

	prompt += `\nProvide a thorough review covering:\n`;
	prompt += `1. Code quality and readability\n`;
	prompt += `2. Potential bugs or issues\n`;
	prompt += `3. Performance considerations\n`;
	prompt += `4. Security concerns\n`;
	prompt += `5. Suggested improvements\n`;
	prompt += `\nFormat your response with clear sections.`;

	return prompt;
}

/**
 * Capabilities of the reviewer agent
 */
export const REVIEWER_CAPABILITIES = [
	'review_code',
	'check_quality',
	'suggest_improvements',
	'validate',
	'security_check',
	'performance_review',
] as const;