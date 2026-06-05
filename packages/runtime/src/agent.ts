// Agent configuration types
// These complement pi-agent-core with RubberDuck-specific extensions

export interface AgentConfig {
	model: string;
	tools?: ToolDefinition[];
	skills?: string[];
}

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema?: unknown;
}

export interface SandboxConfig {
	type: 'virtual' | 'local' | 'container';
}