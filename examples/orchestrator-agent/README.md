# Orchestrator Agent Example

Example demonstrating the orchestrator + subagent workflow pattern in Hanumate.

## Structure

```
orchestrator-agent/
├── .hanumate/
│   ├── agents/
│   │   ├── orchestrator.ts  # Main orchestrator agent
│   │   ├── coder.ts         # Specialist for writing code
│   │   ├── reviewer.ts      # Specialist for code review
│   │   ├── types.ts         # Shared type definitions
│   │   └── index.ts         # Exports
│   └── workflows/
│       └── development.ts   # Development workflow
└── package.json
```

## Agents

### Orchestrator (`orchestrator.ts`)
- Manages multiple specialist agents
- Dispatches tasks based on task type
- Collects and coordinates results
- Maintains shared context between agents

### Coder (`coder.ts`)
- Specialist for writing and implementing code
- Capabilities: write_code, refactor, debug, implement

### Reviewer (`reviewer.ts`)
- Specialist for code review and quality checks
- Capabilities: review_code, check_quality, suggest_improvements

## Key Methods

### registerAgent()
```typescript
orchestrator.registerAgent('coder', coderAgent, ['write_code', 'refactor']);
```

### dispatch()
```typescript
const result = await orchestrator.dispatch({
  id: 'task_1',
  type: 'write_code',
  payload: { description: 'Implement REST API', language: 'typescript' }
});
```

### dispatchAll() - Parallel execution
```typescript
const results = await orchestrator.dispatchAll([task1, task2, task3]);
```

### dispatchSequential() - Sequential with context
```typescript
const results = await orchestrator.dispatchSequential([task1, task2]);
```

## Shared Context

Agents can share data through the SharedContext interface:

```typescript
// After dispatch, data is available to subsequent agents
const results = orchestrator.getResults();
const sharedData = orchestrator.getSharedData();
```

## Usage

```typescript
import { createOrchestrator } from './agents/orchestrator';

// Create and initialize orchestrator with specialists
const orchestrator = await createOrchestrator();

// Dispatch tasks
const result = await orchestrator.dispatch(task);

// Shutdown when done
await orchestrator.shutdown();
```