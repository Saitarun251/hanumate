**Experimental** — RubberDuck is under active development. APIs may change.

Looking for `v1.0.x`? This is the initial release.

# RubberDuck

RubberDuck is a TypeScript framework for building autonomous coding agents. It gives you a headless, programmable agent harness

 RubberDuck agents work the same way as claude code and copilot : they read your codebase, write code, run tests, and handle GitHub workflows. But unlike those tools, RubberDuck is built to be embedded, extended, and deployed anywhere.

---

## Table of Contents

- [What Makes It Different](#what-makes-it-different)
- [Packages](#packages)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Multi-Agent Pipeline](#multi-agent-pipeline)
- [Sandbox Isolation](#sandbox-isolation)
- [GitHub App](#github-app)
- [Supported Models](#supported-models)
- [Skills System](#skills-system)
- [Observability](#observability)
- [CLI](#cli)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## What Makes It Different

Most AI coding tools are applications. RubberDuck is a framework. That means:

- You can build custom agents for your specific use case
- The agent logic lives in your code, not in some external config
- Agents can be wired into GitHub Apps, CI systems, Slack bots, or your own product
- The same agent code runs locally, in containers, or in the cloud

RubberDuck comes with a built-in agent harness, multi-agent orchestration, and sandbox isolation. You bring your own models (OpenAI, Anthropic, MiniMax, Groq, or any OpenAI-compatible API).

---

## Packages

| Package | Description |
| --- | --- |
| `@rubberduck/runtime` | Core: agent harness, sessions, tools, sandbox |
| `@rubberduck/sdk` | TypeScript SDK for building integrations |
| `@rubberduck/cli` | CLI tool for running agents locally |
| `@rubberduck/opentelemetry` | Observability adapter for tracing and metrics |

---

## Installation

```bash
# Clone the repository
git clone https://github.com/Saitarun251/rubberduck.git
cd rubberduck

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Environment Setup

Create a `.env` file in the root directory:

```bash
# LLM Provider API Keys (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
MINIMAX_API_KEY=sk-...

# Sandbox API Keys (optional, for cloud sandboxes)
DAYTONA_API_KEY=...
E2B_API_KEY=...

# GitHub App (if using the GitHub App example)
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
WEBHOOK_SECRET=your-webhook-secret

# OpenTelemetry (optional, for observability)
OTLP_ENDPOINT=http://localhost:4318
```

### Package Structure

```
rubberduck/
├── packages/
│   ├── runtime/          # Core agent runtime
│   │   ├── src/
│   │   │   ├── harness.ts        # Main agent harness
│   │   │   ├── dispatcher.ts      # Multi-agent dispatch
│   │   │   ├── provider-manager.ts # LLM provider management
│   │   │   ├── connectors/        # Sandbox connectors
│   │   │   └── tools/             # Built-in tools
│   │   └── package.json
│   ├── sdk/              # TypeScript SDK
│   ├── cli/              # CLI tool
│   └── opentelemetry/    # Observability adapter
├── apps/
│   └── github-app/       # GitHub App example
└── examples/             # Example implementations
```

---

## Quick Start

### Create Your First Agent

```ts
import { createAgent } from '@rubberduck/runtime';

const agent = createAgent({
  model: 'anthropic/claude-sonnet-4-6',
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});

const harness = await agent.init();
const session = await harness.session();

const response = await session.prompt(
  'Write a hello world function in Python',
);

console.log(response);
```

### Running the Agent

```bash
# Start the runtime server
npm run dev

# Or use the CLI
npx duck dev
```

### Interactive Session

```ts
const harness = await agent.init();
const session = await harness.session();

// Execute shell commands
const shellResult = await session.shell('ls -la');

// Read files
const content = await session.readFile('./package.json');

// Write files
await session.writeFile('./hello.py', 'print("Hello, World!")');

// Run a skill
await session.skill('code-review', { args: { file: './src/index.ts' } });
```

---

## Configuration

### Agent Configuration

```ts
interface RubberDuckConfig {
  name?: string;              // Agent name for logging
  model?: string;             // Model identifier (e.g., 'anthropic/claude-sonnet-4-6')
  providerId?: string;         // Provider ID (e.g., 'openai', 'anthropic', 'minimax')
  apiKey?: string;            // API key (alternative to env)
  baseUrl?: string;           // Custom API base URL (for OpenAI-compatible APIs)
  env?: Record<string, string>; // Environment variables
  shellTimeout?: number;      // Shell command timeout in ms (default: 30000)
  skills?: string[];          // Skills to load
  basePath?: string;          // Working directory for agent
  mcpServers?: MCPServerConfig[]; // MCP server configurations
  sandbox?: {
    type: SandboxConnectorType; // 'local' | 'virtual' | 'daytona' | 'e2b'
    apiKey?: string;
    baseUrl?: string;
  };
  telemetry?: TelemetryConfig; // OpenTelemetry configuration
}
```

### Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For Anthropic models | Anthropic API key |
| `OPENAI_API_KEY` | For OpenAI models | OpenAI API key |
| `MINIMAX_API_KEY` | For MiniMax models | MiniMax API key |
| `GROQ_API_KEY` | For Groq models | Groq API key |
| `DEEPSEEK_API_KEY` | For DeepSeek models | DeepSeek API key |
| `DAYTONA_API_KEY` | For Daytona sandbox | Daytona API key |
| `E2B_API_KEY` | For E2B sandbox | E2B API key |

### Model Format

Models are specified as `<provider>/<model>`:

```ts
const agent = createAgent({
  model: 'anthropic/claude-sonnet-4-6',
});

const agent2 = createAgent({
  model: 'openai/gpt-4o',
});

const agent3 = createAgent({
  model: 'minimax/M2.7',
});

const agent4 = createAgent({
  model: 'groq/llama-3.1-70b',
});

// OpenAI-compatible (Ollama, LM Studio, etc.)
const agent5 = createAgent({
  model: 'openai-compatible/llama3',
  baseUrl: 'http://localhost:11434/v1',
});
```

---

## Multi-Agent Pipeline

RubberDuck's orchestrator coordinates multiple specialist agents for complex tasks.

### Setting Up Agent Registry

```ts
import { createAgent, AgentRegistry, dispatch } from '@rubberduck/runtime';

// Define specialist agents
const orchestrator = createAgent({
  name: 'orchestrator',
  model: 'anthropic/claude-sonnet-4-6',
  skills: ['task-analysis', 'agent-coordination'],
});

const coder = createAgent({
  name: 'coder',
  model: 'openai/gpt-4o',
  skills: ['code-generation', 'refactoring'],
});

const reviewer = createAgent({
  name: 'reviewer',
  model: 'anthropic/claude-sonnet-4-6',
  skills: ['security-audit', 'code-review'],
});

// Register with orchestrator
const registry = new AgentRegistry();
registry.register('orchestrator', orchestrator, ['coordinate', 'analyze']);
registry.register('coder', coder, ['write_code', 'refactor', 'implement']);
registry.register('reviewer', reviewer, ['review_code', 'security', 'quality']);
```

### Dispatching Tasks

```ts
// Dispatch to multiple agents in parallel
const result = await dispatch({
  targets: ['coder', 'reviewer'],
  task: {
    id: 'task-1',
    type: 'code',
    payload: {
      description: 'Implement REST API for user management',
      language: 'typescript',
      framework: 'express',
    },
  },
});

console.log(result);
// {
//   coder: { output: '...', status: 'success' },
//   reviewer: { output: '...', status: 'success' }
// }
```

### Sequential Dispatch

```ts
import { dispatchSequential } from '@rubberduck/runtime';

// Run agents sequentially with shared context
const results = await dispatchSequential(
  ['coder', 'reviewer'],
  {
    initialContext: {
      task: 'Implement authentication system',
      requirements: ['JWT', 'OAuth2', 'password hashing'],
    },
    onStepComplete: (step, result) => {
      console.log(`Step ${step} completed:`, result);
    },
  }
);
```

### Async Dispatch

```ts
import { dispatchAsync } from '@rubberduck/runtime';

// Dispatch to multiple agents and collect results
const results = await dispatchAsync([
  { agent: 'coder', task: { type: 'write', payload: {...} } },
  { agent: 'reviewer', task: { type: 'review', payload: {...} } },
  { agent: 'tester', task: { type: 'test', payload: {...} } },
]);

// Results are collected as they complete
for (const [agent, result] of Object.entries(results)) {
  console.log(`${agent}:`, result);
}
```

---

## Sandbox Isolation

Agents can execute code in isolated environments for security and consistency.

### Local Sandbox

Direct filesystem and shell access. Fast but less isolated.

```ts
import { createAgent, createSandbox } from '@rubberduck/runtime';

const agent = createAgent({
  sandbox: createSandbox('local'),
  model: 'openai/gpt-4o',
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
```

### Virtual Sandbox

In-memory filesystem. Very fast, good for testing.

```ts
const fastAgent = createAgent({
  sandbox: createSandbox('virtual'),
  model: 'openai/gpt-4o',
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
```

### Daytona Cloud Sandbox

Full Linux container in the cloud. Best for production.

```ts
const containerAgent = createAgent({
  sandbox: createSandbox('daytona', {
    apiKey: process.env.DAYTONA_API_KEY,
    baseUrl: 'https://api.daytona.io', // optional
  }),
  model: 'openai/gpt-4o',
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
```

### E2B Secure Sandbox

Secure cloud sandbox with code interpretation.

```ts
const secureAgent = createAgent({
  sandbox: createSandbox('e2b', {
    apiKey: process.env.E2B_API_KEY,
    template: 'typescript', // sandbox template
  }),
  model: 'openai/gpt-4o',
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
```

### Sandbox Configuration

```ts
interface SandboxConfig {
  type: 'local' | 'virtual' | 'daytona' | 'e2b';
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;          // Sandbox timeout in ms
  memory?: number;           // Memory limit in MB
  cpu?: number;              // CPU cores
  storage?: number;          // Storage limit in MB
}
```

---

## GitHub App

A GitHub App that responds to issues and PRs autonomously. See `apps/github-app` for full deployment guide.

### Setup

```bash
cd apps/github-app
npm install
```

### Configuration

```bash
# .env file
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
WEBHOOK_SECRET=your-webhook-secret

# Optional: Forward webhook to localhost
# Use localtunnel or ngrok during development
WEBHOOK_URL=https://your-domain.com/webhook
```

### Running

```bash
# Development
npm run dev

# Production
npm start
```

### Triggers

The GitHub App responds to multiple trigger types:

1. **@mention** — Comment on issues/PRs mentioning the app
2. **Label-based** — Label issues to dispatch tasks
3. **PR review** — Auto-review PRs on creation
4. **Branch pattern** — React to branch naming conventions
5. **GitHub Actions** — Trigger via workflow dispatch

### Example Handlers

```ts
// apps/github-app/src/handlers/issue-handler.ts
export async function handleIssueComment(payload: WebhookPayload) {
  const { issue, comment, installation } = payload;

  // Create agent session for this interaction
  const agent = createAgent({
    model: 'anthropic/claude-sonnet-4-6',
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  const harness = await agent.init();
  const session = await harness.session();

  // Analyze and respond
  const response = await session.prompt(
    `Analyze this issue and provide guidance:\n\n${issue.body}`
  );

  // Post response
  await postComment(installation, issue.number, response);
}
```

---

## Supported Models

RubberDuck works with any LLM provider that supports tool calling.

### Built-in Providers

| Provider | Example Models | API Key Env |
| --- | --- | --- |
| OpenAI | gpt-4o, gpt-4, gpt-3.5-turbo | `OPENAI_API_KEY` |
| Anthropic | claude-sonnet-4-6, claude-3-5-sonnet, claude-3-opus | `ANTHROPIC_API_KEY` |
| MiniMax | M2.7, M2.7-highspeed | `MINIMAX_API_KEY` |
| DeepSeek | deepseek-chat, deepseek-coder | `DEEPSEEK_API_KEY` |
| Groq | llama-3.1-70b, mixtral-8x7b | `GROQ_API_KEY` |
| Google | gemini-2.0-flash, gemini-1.5-pro | `GOOGLE_API_KEY` |
| Mistral | mistral-large, mistral-7b | `MISTRAL_API_KEY` |
| Cohere | command-r-plus, command-r | `COHERE_API_KEY` |

### OpenAI-Compatible Providers

Any API that follows OpenAI's format:

```ts
const agent = createAgent({
  model: 'openai-compatible/llama3',
  baseUrl: 'http://localhost:11434/v1', // Ollama
  apiKey: 'not-required', // Ollama doesn't need API key
});

// LM Studio
const agent2 = createAgent({
  model: 'openai-compatible/any-model',
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'not-required',
});

// vLLM
const agent3 = createAgent({
  model: 'openai-compatible/mistral-7b',
  baseUrl: 'https://your-vllm-server.com/v1',
  apiKey: process.env.VLLM_API_KEY,
});
```

### Provider Fallback

```ts
const agent = createAgent({
  model: 'anthropic/claude-sonnet-4-6',
  providerFallback: ['openai/gpt-4o', 'groq/llama-3.1-70b'],
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  },
});
```

---

## Skills System

Skills extend agent capabilities with specialized instructions and workflows.

### Defining a Skill

Create a skill file at `.rubberduck/.agents/skills/<name>/SKILL.md`:

```markdown
# Code Review Skill

## Description
Reviews code for security vulnerabilities, performance issues, and best practices.

## Instructions
You are a code reviewer. Analyze the provided code and identify:
1. Security vulnerabilities (SQL injection, XSS, etc.)
2. Performance issues (N+1 queries, memory leaks)
3. Code quality issues (duplication, complexity)
4. Best practice violations

## Output Format
Return a structured review with:
- Severity: critical/high/medium/low
- Location: file and line number
- Description: what the issue is
- Recommendation: how to fix it
```

### Loading Skills

```ts
// Load skills during agent initialization
const harness = await agent.init({
  skills: ['code-review', 'security-audit', 'refactoring'],
});

// Or load dynamically
await harness.loadSkills(['triage', 'documentation']);
```

### Running a Skill

```ts
const session = await harness.session();

// Run a skill by name
const result = await session.skill('code-review', {
  args: {
    file: './src/index.ts',
    focus: 'security',
  },
});

// Pass context
const result2 = await session.skill('triage', {
  args: { issueNumber: 123 },
  context: {
    repo: 'Saitarun251/rubberduck',
    labels: ['bug', 'priority'],
  },
});
```

### Built-in Skills

| Skill | Description |
| --- | --- |
| `code-review` | Reviews code for quality and security |
| `security-audit` | Performs security vulnerability scanning |
| `refactoring` | Suggests code improvements and refactoring |
| `documentation` | Generates and maintains documentation |
| `triage` | Triages issues and assigns priorities |
| `testing` | Generates unit and integration tests |

---

## Observability

Plug in OpenTelemetry for distributed tracing and metrics.

### Basic Setup

```ts
import { initTelemetry } from '@rubberduck/opentelemetry';

const telemetry = await initTelemetry({
  serviceName: 'rubberduck-agent',
  serviceVersion: '1.0.0',
  otlpEndpoint: process.env.OTLP_ENDPOINT || 'http://localhost:4318',
});
```

### Custom Tracing

```ts
import { trace, SpanKind, SpanStatusCode } from '@rubberduck/opentelemetry';

const span = trace.startSpan('agent-execution', {
  kind: SpanKind.INTERNAL,
  attributes: {
    'agent.name': 'coder',
    'task.type': 'code-generation',
  },
});

try {
  const result = await session.prompt('Write code');
  span.setStatus({ code: SpanStatusCode.OK });
  span.setAttribute('result.length', result.length);
} catch (error) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
} finally {
  span.end();
}
```

### Metrics

```ts
import { metrics } from '@rubberduck/opentelemetry';

// Counter
const requestCounter = metrics.createCounter('agent_requests_total', {
  description: 'Total number of agent requests',
});

// Histogram
const latencyHistogram = metrics.createHistogram('agent_latency_ms', {
  description: 'Agent request latency in milliseconds',
  unit: 'ms',
});

// Record metrics
requestCounter.add(1, { model: 'claude-sonnet-4-6' });
latencyHistogram.record(duration, { operation: 'prompt' });
```

### Log Integration

```ts
import { logger } from '@rubberduck/opentelemetry';

logger.info('Agent initialized', {
  agent: 'coder',
  model: 'gpt-4o',
  sandbox: 'daytona',
});

logger.error('Task failed', {
  taskId: 'task-123',
  error: error.message,
  stack: error.stack,
});
```

---

## CLI

Run agents from the command line.

### Commands

```bash
# Agent Management
duck dev                          # Start development mode
duck status                        # Check agent status
duck init my-agent                # Initialize a new agent project

# Work Management (Hook System)
duck hook list                    # List all hooks
duck hook assign <bead-id> <agent> # Assign work to agent
duck hook status <agent-id>       # Check agent's hook status
duck hook unassign <hook-id>      # Remove hook from queue

# Issue Tracking (Beads)
duck bead create --title="Fix bug" --type=bug --priority=P1
duck bead list --status=open
duck bead show rd-abc12
duck bead update rd-abc12 --status=in_progress
duck bead close rd-abc12
duck bead ready                   # Show unblocked work

# Work Bundling (Convoys)
duck convoy create "Feature X" rd-abc12 rd-def34
duck convoy list
duck convoy show cv-abc12
duck convoy add cv-abc12 rd-ghi56
duck convoy land cv-abc12

# Messaging (Mail)
duck mail send <agent-id> -s "Subject" -m "Message"
duck mail inbox
duck mail read <mail-id>

# Merge Queue (Refinery)
duck refinery list
duck refinery status
duck refinery enqueue <branch>
duck refinery show <mr-id>

# Session Management
duck session list
duck session show <session-id>
duck session stats

# Server Mode (HTTP/WebSocket)
duck server start [--port 3000] [--daemon]
duck server stop
duck server status

# Skills
duck skills list
duck skill run code-review --file ./src/index.ts
```

### Configuration

Create `duck.config.js`:

```js
export default {
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: 'local',
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  skills: ['code-review', 'refactoring'],
};
```

---

## Architecture

```
Request / Hook Queue
  |
  v
Harness (init)
  |
  v
Provider Manager (LLM abstraction)
  |
  v
Orchestrator (dispatch)
  |
  +-----+-----+-----+-----+
  v     v     v     v
Hook  Bead  Convoy Mail
  |     |     |     |
  +-----+-----+-----+
  |           |
  v           v
Watchdog    Refinery
(Health)   (Merge Queue)
  |
  v
Response / Seance (Recovery)
```

### Core Components

| Component | Directory | Description |
| --- | --- | --- |
| **Harness** | `src/harness.ts` | Main agent runtime, session management |
| **Dispatcher** | `src/dispatch.ts` | Multi-agent coordination |
| **Provider Manager** | `src/providers.ts` | LLM provider abstraction |
| **Hook System** | `src/hooks/` | Persistent work queue (GUPP principle) |
| **Beads** | `src/beads/` | Git-backed issue tracking |
| **Convoys** | `src/convoys/` | Work bundling and grouping |
| **Mail** | `src/mail/` | Persistent agent messaging |
| **Nudge** | `src/nudge/` | Real-time inter-agent communication |
| **Watchdog** | `src/watchdog/` | Health monitoring (Witness + Deacon + Dogs) |
| **Refinery** | `src/refinery/` | Bors-style merge queue with bisecting |
| **Escalation** | `src/escalation/` | Severity-routed issue escalation |
| **Seance** | `src/recovery/` | Session discovery and recovery |
| **HTTP Server** | `src/server/` | Hono-based HTTP/WebSocket server |
| **Sandbox Connectors** | `src/connectors/` | Sandboxed code execution |
| **Skills** | `src/skills.ts` | Agent capability extensions |
| **MCP** | `src/mcp.ts` | Model Context Protocol support |

### Session Flow

```ts
1. Create agent with configuration
2. Initialize harness (loads skills, sets up telemetry)
3. Create session (isolated execution context)
4. Prompt agent (send task to LLM)
5. Execute tools (shell, filesystem as needed)
6. Return response
7. Optionally dispatch to other agents
8. Collect and aggregate results
```

---

## Examples

See `examples/` for complete implementations:

### orchestrator-agent

Multi-agent coordination with task routing:

```bash
cd examples/orchestrator-agent
npm install
npm run dev
```

### coding-agent

Code generation with sandbox:

```bash
cd examples/coding-agent
npm install
npm run dev
```

### support-bot

FAQ and documentation search:

```bash
cd examples/support-bot
npm install
npm run dev
```

### ci-triage

Issue triage in CI:

```bash
cd examples/ci-triage
npm install
npm run dev
```

---

## Contributing

Contributions are welcome. Please read our contributing guidelines before submitting PRs.

### Development Setup

```bash
# Clone and install
git clone https://github.com/Saitarun251/rubberduck.git
cd rubberduck
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific package tests
npm test --workspace=@rubberduck/runtime

# Run in CI mode (no watch)
npm run test:ci
```

### Code Style

```bash
# Format code
npm run format

# Lint code
npm run lint

# Type check
npm run typecheck
```

---

## License

MIT License

Copyright (c) 2024 Saitarun251

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.