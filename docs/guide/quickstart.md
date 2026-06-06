# Quick Start

Build your first autonomous coding agent in under 5 minutes.

## 1. Create Project

```bash
mkdir my-agent && cd my-agent
npm init -y
npm install @kishkindhalabs/hanumate-runtime
```

## 2. Create Agent

Create `agent.ts`:

```typescript
import { createAgent } from '@kishkindhalabs/hanumate-runtime';
import { exists, read, write } from '@kishkindhalabs/hanumate-runtime';

const agent = createAgent({
  name: 'coder',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function main() {
  // Create session
  const session = await agent.createSession();
  
  // Read a file
  const code = await session.readFile('./src/index.ts');
  
  // Ask agent to analyze
  const analysis = await session.prompt(
    'Analyze this code and suggest improvements:\n\n' + code
  );
  
  console.log(analysis);
}

main();
```

## 3. Run

```bash
npx tsx agent.ts
```

## 4. Agent Can Also Write Code

```typescript
const session = await agent.createSession();

// Ask agent to create a file
await session.prompt(`
  Create a REST API server in TypeScript using Express.
  Save it to ./server.ts
`);

// The agent will use writeFile to create the file
```

## What's Next?

- [Learn about Agents](/guide/agents)
- [Using Tools](/guide/tools)
- [CLI Commands](/guide/cli)
- [Work with Hooks and Beads](/guide/cli-hooks)