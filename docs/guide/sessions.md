# Sessions

Each agent runs in a session — an isolated execution context.

## Create Session

```typescript
const session = await agent.createSession();
```

## Session Methods

### Prompt

Send a message to the agent:

```typescript
const response = await session.prompt('Write a hello world function');
```

### Shell

Execute shell commands:

```typescript
const result = await session.shell('npm run build');
// result: { stdout, stderr, exitCode }
```

### File Operations

```typescript
// Read
const content = await session.readFile('/path/to/file.ts');

// Write
await session.writeFile('/path/to/file.ts', 'const x = 1;');

// Glob
const files = await session.glob('**/*.ts');
```

### History

```typescript
// Get conversation history
const history = await session.getHistory();

// Clear history
await session.clearHistory();
```

## Session Persistence

Sessions can be saved and restored:

```typescript
// Save session state
await session.save();

// Later, restore...
const session = await agent.createSession({ resume: true });
```