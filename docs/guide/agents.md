# Agents

Agents are the core building blocks of Hanumate.

## Create Agent

```typescript
import { createAgent } from '@hanumateharness/runtime';

const agent = createAgent({
  name: 'coder',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});
```

## Agent Configuration

```typescript
const agent = createAgent({
  name: 'my-agent',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
  
  // Optional
  tools: [shellTool, fsTool],
  skills: ['coding', 'debugging'],
  sandbox: 'local'
});
```

## Create Session

```typescript
const session = await agent.createSession();

// Session provides tools for the agent
const result = await session.prompt('Write a REST API');
```

## Multi-Agent

```typescript
import { AgentRegistry, Dispatcher } from '@hanumateharness/runtime';

const registry = new AgentRegistry();
const dispatcher = new Dispatcher(registry);

// Register agents
registry.register('coder', coderAgent, ['write_code']);
registry.register('reviewer', reviewerAgent, ['review_code']);

// Dispatch to multiple agents
const results = await dispatcher.dispatchAsync([
  { agent: 'coder', task: 'Write a function' },
  { agent: 'reviewer', task: 'Review the function' }
]);
```