// MCP (Model Context Protocol) integration
// Built on top of @modelcontextprotocol/sdk

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export interface MCPConfig {
	url: string;
	headers?: Record<string, string>;
}

export interface MCPServerConfig {
	name: string;
	/** URL for SSE transport (e.g., 'https://mcp.github.com/mcp') */
	url?: string;
	/** Command for stdio transport (e.g., 'npx', 'uvx') */
	command?: string;
	/** Arguments for stdio transport */
	args?: string[];
	/** Environment variables for stdio transport */
	env?: Record<string, string>;
}

export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema?: unknown;
}

export interface MCPConnection {
	name: string;
	client: Client;
	tools: MCPToolDefinition[];
}

/**
 * Create a new MCP client with the given name
 */
function createClient(name: string): Client {
	return new Client(
		{
			name: `rubberduck-${name}`,
			version: '1.0.0',
		},
		{
			capabilities: {},
		}
	);
}

/**
 * Connect to an MCP server using SSE transport
 */
async function connectSSE(name: string, url: string): Promise<Client> {
	const transport = new SSEClientTransport(new URL(url));
	const client = createClient(name);
	await client.connect(transport);
	return client;
}

/**
 * Connect to an MCP server using stdio transport
 */
async function connectStdio(
	name: string,
	command: string,
	args: string[],
	env?: Record<string, string>
): Promise<Client> {
	const transport = new StdioClientTransport({ command, args, env });
	const client = createClient(name);
	await client.connect(transport);
	return client;
}

/**
 * Connect to an MCP server and return the client and available tools
 * @param name - Unique name for this MCP server connection
 * @param config - Server configuration (URL for SSE or command/args for stdio)
 * @returns Object containing the MCP client and list of available tools
 */
export async function connectMCP(
	name: string,
	config: MCPServerConfig
): Promise<MCPConnection> {
	let client: Client;
	let tools: MCPToolDefinition[] = [];

	if (config.url) {
		// SSE transport - connect to HTTP endpoint
		client = await connectSSE(name, config.url);
	} else if (config.command) {
		// Stdio transport - spawn local process
		client = await connectStdio(name, config.command, config.args ?? [], config.env);
	} else {
		throw new Error(
			`MCP server '${name}': must specify either 'url' for SSE or 'command' for stdio transport`
		);
	}

	// Request the list of available tools
	const toolList = await client.listTools();
	tools = toolList.tools.map((tool) => ({
		name: tool.name,
		description: tool.description ?? '',
		inputSchema: tool.inputSchema,
	}));

	return {
		name,
		client,
		tools,
	};
}

/**
 * Connect to multiple MCP servers
 * @param servers - Array of MCP server configurations
 * @returns Array of MCP connections with their tools
 */
export async function connectMCPServers(
	servers: MCPServerConfig[]
): Promise<MCPConnection[]> {
	const connections: MCPConnection[] = [];

	for (const server of servers) {
		try {
			const connection = await connectMCP(server.name, server);
			connections.push(connection);
			console.log(`MCP: Connected to '${server.name}' with ${connection.tools.length} tools`);
		} catch (error) {
			console.error(`MCP: Failed to connect to '${server.name}':`, error);
			throw error;
		}
	}

	return connections;
}

/**
 * Convert MCP tool definitions to RubberDuck tool format
 * @param mcpTools - Array of MCP tool definitions
 * @param serverName - Name of the MCP server these tools come from
 * @returns Array of tools in RubberDuck format
 */
export function mcpToolsToRubberDuck(
	mcpTools: MCPToolDefinition[],
	serverName: string
): Array<{
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
	handler: (params: Record<string, unknown>) => Promise<unknown>;
}> {
	return mcpTools.map((tool) => ({
		name: `${serverName}_${tool.name}`,
		description: `[MCP:${serverName}] ${tool.description}`,
		parameters: tool.inputSchema as Record<string, unknown> | undefined,
		handler: async (params: Record<string, unknown>) => {
			// Handler will be provided by the caller with access to the client
			return { tool: tool.name, params, server: serverName };
		},
	}));
}
