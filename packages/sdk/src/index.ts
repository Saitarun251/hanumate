// @kishkindhalabs/hanumate-sdk - Client SDK
export interface AgentConnection {
	prompt(message: string): Promise<string>;
	close(): void;
}

export interface WorkflowConnection {
	invoke(payload: unknown): Promise<unknown>;
}

export interface HanumateClient {
	agents: {
		connect(name: string, id: string): Promise<AgentConnection>;
	};
	workflows: {
		connect(name: string): Promise<WorkflowConnection>;
	};
}

export function createClient(config: { baseUrl: string }): HanumateClient {
	// TODO: implement full SDK
	throw new Error('Not implemented yet');
}