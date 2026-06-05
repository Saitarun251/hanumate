# RubberDuck Agent Architecture

This document describes the agent architecture in RubberDuck framework.

## Overview

RubberDuck uses a **multi-agent orchestration pattern** where specialized agents work together to handle complex tasks.

```
User Request
     ↓
┌────────────────────────────────────────┐
│           Orchestrator Agent            │
│  - Analyzes task                       │
│  - Determines which agents to invoke   │
│  - Coordinates execution               │
└────────────────────────────────────────┘
     ↓
┌─────────────┐        ┌─────────────────┐
│  Coder      │        │    Reviewer     │
│  Agent      │        │    Agent        │
│             │        │                 │
│ - Write code │        │ - Security      │
│ - Refactor   │        │ - Quality       │
│ - Implement  │        │ - Performance   │
└─────────────┘        └─────────────────┘
```

## Agent Types

### 1. Orchestrator Agent

The orchestrator is the central coordinator that:
- Receives tasks
- Analyzes requirements
- Dispatches to specialist agents
- Collects and aggregates results

```typescript
import { AgentRegistry, Dispatcher } from '@rubberduck/runtime';

const registry = new AgentRegistry();
const dispatcher = new Dispatcher(registry);

// Register agents
registry.register('orchestrator', orchestratorAgent, ['coordinate']);
registry.register('coder', coderAgent, ['write_code', 'refactor']);
registry.register('reviewer', reviewerAgent, ['review_code']);

// Dispatch task
const result = await dispatcher.dispatch({
  id: 'task-1',
  type: 'write_code',
  payload: { description: 'Implement REST API' }
});
```

### 2. Coder Agent

Specializes in code implementation:
- Writes new code
- Refactors existing code
- Implements features
- Fixes bugs

```typescript
const coderAgent = createAgent({
  name: 'coder',
  model: 'openai/gpt-4o',
  skills: ['code-generation', 'refactoring']
});
```

### 3. Reviewer Agent

Specializes in code quality:
- Security scanning
- Performance analysis
- Code style review
- Best practices check

```typescript
const reviewerAgent = createAgent({
  name: 'reviewer',
  model: 'anthropic/claude-sonnet-4-6',
  skills: ['security-audit', 'code-review']
});
```

## Core Components

### Agent Harness (`packages/runtime/src/harness.ts`)

The foundation for creating agents:

```typescript
import { createAgent, type RubberDuckAgent, type Session } from '@rubberduck/runtime';

// Create agent
const agent = createAgent({
  name: 'my-agent',
  model: 'openai/gpt-4o',
  providerId: 'openai',
  tools: [shellTool, fsTool],
  skills: ['coding', 'debugging']
});

// Create session
const session: Session = await agent.createSession();

// Prompt agent
const response = await session.prompt('Write a hello world function');

// Execute shell
const shellResult = await session.shell('echo "hello"');

// File operations
await session.writeFile('/tmp/test.ts', 'const x = 1;');
const content = await session.readFile('/tmp/test.ts');
```

### Session Interface

Each agent session provides:

```typescript
interface Session {
  // AI interaction
  prompt(message: string): Promise<string>;
  runSkill(skillName: string, context?: Record<string, unknown>): Promise<string>;
  getSkillInstructions(skillName: string): Promise<string>;
  listSkills(): Promise<string[]>;
  
  // Shell execution
  shell(command: string, cwd?: string): Promise<ExecResult>;
  
  // Filesystem operations
  readFile(path: string, options?: ReadOptions): Promise<string | Buffer>;
  writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
  readDir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | FileInfo[]>;
  pathExists(path: string): boolean;
  glob(pattern: string, options?: GlobOptions): Promise<string[]>;
}
```

### Multi-Agent Dispatch

```typescript
import { dispatch, dispatchAsync, dispatchSequential } from '@rubberduck/runtime';

// Parallel dispatch
const results = await dispatchAsync([
  { agent: 'coder', task: { type: 'write', payload: {...} } },
  { agent: 'reviewer', task: { type: 'review', payload: {...} } }
]);

// Sequential dispatch (with shared context)
const sequentialResults = await dispatchSequential(
  ['coder', 'reviewer'],
  { initialContext: { task: 'Implement API' } }
);
```

## Tools

Agents have access to tools:

### Shell Tool

```typescript
const result = await session.shell('npm run build', { cwd: '/project' });
// Returns: { stdout, stderr, exitCode, timedOut }
```

### Filesystem Tool

```typescript
// Read file
const content = await session.readFile('/project/src/index.ts');

// Write file
await session.writeFile('/project/src/new.ts', 'const x = 1;');

// Check existence
if (await session.pathExists('/project/src/index.ts')) {
  // ...
}

// Glob
const files = await session.glob('**/*.test.ts', { cwd: '/project' });
```

## Skills System

Skills extend agent capabilities:

```typescript
// Load specific skills
const skills = await loadAgentSkills(['coding', 'debugging'], '/project/.rubberduck/skills');

// List available skills
const skillNames = await session.listSkills();

// Get skill instructions
const instructions = await session.getSkillInstructions('coding');

// Run skill
const result = await session.runSkill('code-review', { code: myCode });
```

## Sandbox Integration

Agents can use different sandbox types for code execution:

```typescript
import { createSandbox, createAgent } from '@rubberduck/runtime';

// Local sandbox (default)
const localSandbox = createSandbox('local');

// Virtual sandbox (for testing)
const virtualSandbox = createSandbox('virtual');

// Daytona cloud sandbox
const daytonaSandbox = createSandbox('daytona', { 
  apiKey: process.env.DAYTONA_API_KEY 
});

// E2B secure sandbox
const e2bSandbox = createSandbox('e2b', { 
  apiKey: process.env.E2B_API_KEY,
  template: 'typescript'
});

// Use sandbox with agent
const agent = createAgent({
  name: 'isolated-coder',
  model: 'openai/gpt-4o',
  sandbox: e2bSandbox
});
```

## Event Streaming

Agents support real-time event streaming:

```typescript
const agent = new Agent({
  model: getModel('anthropic', 'claude-sonnet-4-6'),
  initialState: {
    systemPrompt: 'You are a coding assistant.'
  }
});

agent.subscribe((event) => {
  switch (event.type) {
    case 'message_update':
      // Streaming response
      process.stdout.write(event.delta);
      break;
    case 'toolcall':
      // Tool execution
      console.log(`Calling tool: ${event.toolName}`);
      break;
  }
});

await agent.prompt('Write a REST API in TypeScript');
```

## Error Handling

```typescript
try {
  const result = await session.prompt('Write code');
} catch (error) {
  if (error instanceof AgentError) {
    console.error(`Agent error: ${error.code}`);
  }
}
```

## Configuration

### Agent Configuration

```typescript
interface RubberDuckConfig {
  name?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerId?: string;
  env?: Record<string, string>;
  shellTimeout?: number;
  skills?: string[];
  basePath?: string;
  mcpServers?: MCPServerConfig[];
  sandbox?: {
    type: SandboxConnectorType;
    apiKey?: string;
    baseUrl?: string;
  };
  telemetry?: TelemetryConfig;
}
```

## Examples

See `examples/` directory for complete implementations:
- `orchestrator-agent/` - Multi-agent coordination
- `coding-agent/` - Code generation agent
- `support-bot/` - Support bot with skills
- `ci-triage/` - CI workflow automation