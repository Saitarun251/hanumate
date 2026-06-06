---
title: Introduction
description: What is Hanumate and why use it?
---

# Introduction

Hanumate is The Agent Harness Framework. If you know how to use Claude Code, then you already know the basics of how to build agents with Hanumate.

## Why Hanumate?

- **You own your agents**: No vendor lock-in, fully customizable
- **Headless by design**: No TUI, no GUI, just API
- **Deploy anywhere**: Node.js, Cloudflare Workers, CI/CD pipelines
- **Skills system**: Reusable skill framework with YAML-based definitions
- **MCP integration**: Connect to Model Context Protocol servers
- **Sandbox execution**: Isolated execution environments (local, virtual, daytona, e2b)
- **Session persistence**: Durable sessions with TTL support
- **OpenTelemetry**: Built-in observability and tracing
- **Multi-provider support**: AWS Bedrock, Azure OpenAI, Vertex AI, and more

## Architecture

```
Agent -> Harness -> Session -> Tools/Sandbox
```

An **agent** is the brain. A **harness** is the runtime environment. A **session** maintains conversation state. **Tools** and **sandboxes** provide execution context.

## Quick Example

```ts
import { createAgent, init } from '@kishkindhalabs/hanumate-runtime';

const agent = createAgent(() => ({
	model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init: initFn, payload }: any) {
	const harness = await initFn(agent);
	const session = await harness.session();

	return await session.prompt('Task: ' + payload.task);
}
```

## CLI Commands

### Development Server

```bash
duck dev --port 3000
```

Starts the Hanumate development server with WebSocket support.

### Workflow Execution

```bash
duck run my-workflow --payload '{"key": "value"}'
```

Execute a workflow from the command line.

### Production Build

```bash
duck build --target node
duck build --target cloudflare
```

Build for Node.js or Cloudflare Workers.

## Configuration

### Provider Configuration

Hanumate supports multiple AI providers:

```typescript
import { configureProvider } from '@kishkindhalabs/hanumate-runtime';

const provider = await configureProvider({
  providerId: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});
```

Enterprise presets available for:
- AWS Bedrock
- Azure OpenAI  
- Google Vertex AI

### MCP Server Configuration

Connect to MCP servers for extended capabilities:

```typescript
const harness = await init(agent, {
  config: {
    mcpServers: [
      { name: 'github', type: 'sse', url: 'https://api.example.com/mcp' },
      { name: 'filesystem', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
    ],
  },
});
```

### Sandbox Configuration

Configure execution sandboxes:

```typescript
const harness = await init(agent, {
  config: {
    sandbox: {
      type: 'virtual', // 'local' | 'virtual' | 'daytona' | 'e2b'
    },
  },
});
```

### Session Persistence

Enable durable sessions:

```typescript
const harness = await init(agent, {
  config: {
    sessionStore: {
      store: inMemorySessionStore,
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
});
```

### OpenTelemetry

Enable tracing and observability:

```typescript
import { initTelemetry } from '@kishkindhalabs/hanumate-opentelemetry';

const { traceProvider, shutdown } = await initTelemetry({
  serviceName: 'hanumate-agent',
  endpoint: 'http://localhost:4318/v1/traces',
});
```
