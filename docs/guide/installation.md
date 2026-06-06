# Installation

## Requirements

- Node.js 18+
- npm 9+ (or pnpm/yarn)

## Install Packages

### Core (Recommended)

```bash
npm install @hanumateharness/runtime
```

### Everything

```bash
npm install @hanumateharness/all
```

### Individual Packages

```bash
# CLI tool
npm install @hanumateharness/cli

# Observability
npm install @hanumateharness/opentelemetry
```

## Environment Setup

Create a `.env` file in your project:

```bash
# At least one LLM provider required
ANTHROPIC_API_KEY=sk-ant-...
# OR
OPENAI_API_KEY=sk-...
# OR
MINIMAX_API_KEY=...

# Optional: Sandbox API keys
DAYTONA_API_KEY=...
E2B_API_KEY=...
```

## TypeScript Configuration

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext"
  }
}
```

## Verify Installation

```typescript
import { createAgent } from '@hanumateharness/runtime';

const agent = createAgent({
  name: 'test',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

console.log('Hanumate installed successfully!');
```

## Next Steps

- [Quick Start](/guide/quickstart) — Build your first agent
- [CLI Installation](/guide/cli) — Set up the hanumate CLI