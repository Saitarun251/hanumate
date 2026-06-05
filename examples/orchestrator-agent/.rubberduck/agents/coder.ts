/**
 * Coder Specialist Agent
 *
 * Specializes in writing and implementing code.
 */

import { createAgent, type RubberDuckAgent } from '@rubberduck/runtime';
import type { TaskContext, TaskResult } from './types.js';

/**
 * Create a coder agent
 */
export function createCoderAgent(config?: {
	model?: string;
	skills?: string[];
}): RubberDuckAgent {
	return createAgent({
		name: 'coder',
		model: config?.model ?? 'anthropic/claude-sonnet-4-6',
		skills: config?.skills ?? ['coding', 'refactor'],
	});
}

/**
 * Execute a coding task
 */
export async function executeCodingTask(
	harness: import('@rubberduck/runtime').Harness,
	task: TaskContext
): Promise<TaskResult> {
	const session = harness.session();

	try {
		const prompt = buildCodingPrompt(task);
		const response = await session.prompt(prompt);

		return {
			success: true,
			agentName: 'coder',
			result: response,
			timestamp: Date.now(),
			metadata: {
				taskId: task.id,
				taskType: task.type,
				language: task.payload.language,
			},
		};
	} catch (error) {
		return {
			success: false,
			agentName: 'coder',
			result: undefined,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Build coding prompt from task context
 */
function buildCodingPrompt(task: TaskContext): string {
	const payload = task.payload;

	let prompt = `You are a coding specialist. Execute the following task:\n\n`;

	if (payload.description) {
		prompt += `Task Description: ${payload.description}\n\n`;
	}

	if (payload.language) {
		prompt += `Language: ${payload.language}\n`;
	}

	if (payload.framework) {
		prompt += `Framework: ${payload.framework}\n`;
	}

	if (payload.code) {
		prompt += `\nExisting Code:\n\`\`\`\n${payload.code}\n\`\`\`\n`;
	}

	if (payload.files && payload.files.length > 0) {
		prompt += `\nFiles to work with:\n${payload.files.map((f) => `- ${f}`).join('\n')}\n`;
	}

	prompt += `\nProvide a complete implementation with code blocks and explanations.`;

	return prompt;
}

/**
 * Capabilities of the coder agent
 */
export const CODER_CAPABILITIES = [
	'write_code',
	'refactor',
	'debug',
	'implement',
	'fix_bugs',
	'optimize',
] as const;