# Assistant Agent Example

An AI assistant agent with MCP (Model Context Protocol) tool integration.

## MCP Server Configuration

This example demonstrates how to configure MCP servers when creating an agent:

```typescript
import { createAgent, init } from '@rubberduck/runtime';

async function main() {
	// Create agent with MCP servers
	const agent = createAgent({
		model: 'anthropic/claude-sonnet-4-6',
		mcpServers: [
			// GitHub MCP server via SSE
			{
				name: 'github',
				url: 'https://mcp.github.com/mcp'
			},
			// Filesystem MCP server via stdio
			{
				name: 'filesystem',
				command: 'npx',
				args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
			}
		]
	});

	// Initialize the agent (connects to MCP servers)
	const harness = await init(agent, {
		config: {
			mcpServers: agent.mcpServers
		}
	});

	// MCP tools are automatically merged with agent tools
	console.log('Available tools:', harness.agent.tools.map(t => t.name));

	// Use the session to interact
	const session = harness.session();
	const response = await session.prompt('Hello!');

	// Cleanup
	await harness.shutdown();
}

main();
```

## MCP Server Types

### SSE Transport (HTTP)
Use `url` to connect to MCP servers over HTTP with Server-Sent Events:

```typescript
{
	name: 'github',
	url: 'https://mcp.github.com/mcp',
	headers: { 'Authorization': 'Bearer token' } // optional
}
```

### Stdio Transport (Local Process)
Use `command` and `args` to spawn local MCP server processes:

```typescript
{
	name: 'filesystem',
	command: 'npx',
	args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
	env: { DEBUG: 'true' } // optional environment variables
}
```

## Available MCP Servers

- [GitHub](https://github.com/github/github-mcp-server) - GitHub API integration
- [Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) - Local filesystem operations
- [Brave Search](https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search) - Web search
- [Slack](https://github.com/modelcontextprotocol/servers/tree/main/src/slack) - Slack messaging
- [Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) - Knowledge graph storage

## Usage

```bash
duck dev
```

## Tool Naming

MCP tools are prefixed with the server name to avoid conflicts:

- `github_create_issue`
- `github_list_repos`
- `filesystem_read_file`
- `filesystem_write_file`
