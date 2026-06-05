export interface ModelConfig {
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
}

export interface WorkflowContext {
	id: string;
	payload: unknown;
	env: Record<string, string>;
}

export interface WorkflowResult {
	data: unknown;
}

// Skill system types
export interface Skill {
	name: string;
	description: string;
	instructions: string;
	tools?: string[];
}

export interface SkillMetadata {
	name: string;
	description: string;
	tools?: string[];
}