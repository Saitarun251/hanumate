// Assistant workflow example with MCP integration
// This demonstrates how to use MCP tools in a workflow

import type { WorkflowContext, WorkflowResult } from '@rubberduck/runtime';
import { createAgent, init, type RubberDuckAgent } from '@rubberduck/runtime';

export interface AssistantPayload {
	message: string;
	mcpServers?: Array<{
		name: string;
		url?: string;
		command?: string;
		args?: string[];
	}>;
}

export async function run(context: WorkflowContext): Promise<WorkflowResult> {
	const payload = context.payload as AssistantPayload;

	// Create agent with MCP servers from payload
	const agentConfig: Parameters<typeof createAgent>[0] = {
		model: 'anthropic/claude-sonnet-4-6',
		mcpServers: payload.mcpServers?.map((server) => ({
			name: server.name,
			url: server.url,
			command: server.command,
			args: server.args,
		})),
	};

	const agent = createAgent(agentConfig);

	// Initialize with MCP connections
	const harness = await init(agent, {
		config: agentConfig,
	});

	try {
		// Get the session and prompt
		const session = harness.session();
		const response = await session.prompt(payload.message);

		// Return the response with metadata
		return {
			data: {
				response,
				mcpConnections: agent.mcpConnections.map((c) => ({
					name: c.name,
					tools: c.tools.map((t) => t.name),
				})),
				totalTools: agent.tools.length,
			},
		};
	} finally {
		// Always cleanup MCP connections
		await harness.shutdown();
	}
}
