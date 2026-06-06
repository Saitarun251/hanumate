# @hanumateharness/runtime

The core framework for building autonomous coding agents.

## Installation

```bash
npm install @hanumateharness/runtime
```

## Usage

```typescript
import { createAgent } from '@hanumateharness/runtime';

const agent = createAgent({
  name: 'coder',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

const session = await agent.createSession();
const result = await session.prompt('Write a hello world function');
```

## API

### createAgent(config)

Creates a new agent instance.

```typescript
import { createAgent } from '@hanumateharness/runtime';

const agent = createAgent({
  name: 'my-agent',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: [shellTool, fsTool],
  skills: ['coding', 'debugging']
});
```

### Session Methods

```typescript
const session = await agent.createSession();

// Prompt the agent
const response = await session.prompt('Write a REST API');

// File operations
await session.writeFile('/path/to/file.ts', code);
const content = await session.readFile('/path/to/file.ts');

// Shell commands
const result = await session.shell('npm run build');

// Glob files
const files = await session.glob('**/*.test.ts');

// Check path
if (session.pathExists('/path/to/file.ts')) {
  // ...
}
```

## Tools

The runtime includes built-in tools:

- **Shell** — Execute shell commands
- **Filesystem** — Read, write, delete files
- **Glob** — Find files by pattern

## Sandboxes

Agents can run in isolated sandboxes:

```typescript
import { createAgent, createSandbox } from '@hanumateharness/runtime';

// Local sandbox (default)
const agent = createAgent({ name: 'local', model: 'claude-sonnet-4-6' });

// Daytona cloud sandbox
const daytonaSandbox = createSandbox('daytona', {
  apiKey: process.env.DAYTONA_API_KEY
});

// E2B sandbox
const e2bSandbox = createSandbox('e2b', {
  apiKey: process.env.E2B_API_KEY
});
```