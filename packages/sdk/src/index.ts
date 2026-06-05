// @rubberduck/sdk - Client SDK
export interface AgentConnection {
	prompt(message: string): Promise<string>;
	close(): void;
}

export interface WorkflowConnection {
	invoke(payload: unknown): Promise<unknown>;
}

export interface RubberDuckClient {
	agents: {
		connect(name: string, id: string): Promise<AgentConnection>;
	};
	workflows: {
		connect(name: string): Promise<WorkflowConnection>;
	};
}

export function createClient(config: { baseUrl: string }): RubberDuckClient {
	// TODO: implement full SDK
	throw new Error('Not implemented yet');
}