# Tools

Agents have access to built-in tools for interacting with the filesystem and running shell commands.

## Shell Tool

Execute shell commands:

```typescript
const session = await agent.createSession();

// Basic command
const result = await session.shell('npm run build');

// With working directory
const result = await session.shell('npm test', '/path/to/project');
```

## Filesystem Tool

### Read File

```typescript
const content = await session.readFile('/path/to/file.ts');
```

### Write File

```typescript
await session.writeFile('/path/to/file.ts', 'const x = 1;');
```

### Check Existence

```typescript
if (session.pathExists('/path/to/file.ts')) {
  // File exists
}
```

### Glob

```typescript
// Find all TypeScript files
const files = await session.glob('**/*.ts');

// Find test files
const tests = await session.glob('**/*.test.ts');
```

### Directory Operations

```typescript
// Create directory
await session.mkdir('/path/to/dir', { recursive: true });

// Read directory
const files = await session.readDir('/path/to/dir');

// Copy file
await session.copyFile('/src.ts', '/dest.ts');

// Delete file
await session.deleteFile('/path/to/file.ts');

// Delete directory
await session.deleteDir('/path/to/dir');

// Move file
await session.moveFile('/src.ts', '/dest.ts');
```

## Custom Tools

```typescript
import { createAgent, type Tool } from '@kishkindhalabs/hanumate-runtime';

const customTool: Tool = {
  name: 'my-tool',
  description: 'Does something useful',
  execute: async (args) => {
    // Custom logic
    return 'result';
  }
};

const agent = createAgent({
  name: 'agent',
  model: 'claude-sonnet-4-6',
  tools: [shellTool, fsTool, customTool]
});
```