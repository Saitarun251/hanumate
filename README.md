# 🦆 RubberDuck

**India's First Open-Source Autonomous Code Agent Framework**

Build AI coding assistants that understand your codebase, write code, review PRs, and handle GitHub workflows — all powered by multi-agent orchestration.

---

## ✨ Features

### 🧠 Multi-Agent Orchestration
- **Orchestrator Agent** - Coordinates task dispatch
- **Coder Agent** - Writes and implements code  
- **Reviewer Agent** - Reviews code for security, quality, performance

### 🔗 20+ LLM Providers
Built on `@earendil-works/pi-ai` with native support for:
- **OpenAI** (GPT-4, GPT-3.5)
- **Anthropic** (Claude 3.5, Claude 3)
- **MiniMax** (M2.7, high-speed models)
- **DeepSeek**, **Groq**, **Google Gemini**, **Mistral**, and more
- **Any OpenAI-compatible API** (Ollama, LM Studio, vLLM)

### 🐳 4 Sandbox Types
- **Local** - Real shell and filesystem
- **Virtual** - In-memory filesystem (for testing)
- **Daytona** - Cloud container isolation
- **E2B** - Secure cloud sandbox

### 📦 GitHub Integration
- **5 Trigger Modes**: Mention, Label, PR, Branch, GitHub Actions
- **Auto-respond** to issues and PRs
- **Code review** with security scanning
- **Multi-repo** configuration

### 🛠️ Developer Tools
- **MCP (Model Context Protocol)** - Extend with custom tools
- **OpenTelemetry** - Full observability and tracing
- **CLI** - `duck` command-line tool
- **SDK** - Integrate into your applications

---

## 📁 Package Structure

```
rubberduck/
├── packages/
│   ├── runtime/        # Core agent engine (@rubberduck/runtime)
│   ├── sdk/           # TypeScript SDK (@rubberduck/sdk)
│   ├── cli/           # CLI tool (duck)
│   └── opentelemetry/ # Observability (@rubberduck/opentelemetry)
├── apps/
│   └── github-app/   # GitHub App example
├── examples/
│   ├── orchestrator-agent/  # Multi-agent example
│   ├── coding-agent/        # Code generation example
│   ├── assistant/           # Assistant workflow
│   ├── support-bot/        # Support bot example
│   └── ci-triage/           # CI triage workflow
└── docs/             # Documentation
```

---

## 🚀 Quick Start

### 1. Create an Agent

```typescript
import { createAgent } from '@rubberduck/runtime';

const agent = createAgent({
  name: 'my-coder',
  model: 'openai/gpt-4o',
  providerId: 'openai',
  env: {
    OPENAI_API_KEY: 'your-api-key'
  }
});
```

### 2. Use the Session Interface

```typescript
const session = await agent.createSession();

const response = await session.prompt('Write a hello world function in Python');
console.log(response);

await session.runSkill('code-review', { code: response });
```

### 3. Dispatch to Multiple Agents

```typescript
import { dispatch } from '@rubberduck/runtime';

const result = await dispatch({
  targets: ['coder', 'reviewer'],
  task: {
    id: 'task-1',
    type: 'write_code',
    payload: { description: 'Implement REST API' }
  }
});

console.log(result.success);
console.log(result.results);
```

---

## 🔧 Configuration

### Environment Variables

```bash
# LLM Provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINIMAX_API_KEY=sk-...

# Sandbox (optional)
DAYTONA_API_KEY=...
E2B_API_KEY=...
```

### Sandbox Selection

```typescript
import { createSandbox } from '@rubberduck/runtime';

// Local (default)
const local = createSandbox('local');

// Virtual (in-memory, for testing)
const virtual = createSandbox('virtual');

// Daytona (cloud containers)
const daytona = createSandbox('daytona', { 
  apiKey: process.env.DAYTONA_API_KEY 
});

// E2B (secure cloud sandbox)
const e2b = createSandbox('e2b', { 
  apiKey: process.env.E2B_API_KEY,
  template: 'typescript'
});
```

---

## 📱 GitHub App

The GitHub App provides autonomous code assistance directly in your repositories.

### Features
- **@mention** - Comment `@rubberduck help me` on issues/PRs
- **Labels** - Add `rubberduck-dispatch` to trigger review
- **PR Review** - Automatic code review on PR creation
- **Branch triggers** - React to branch patterns

### Deployment

```bash
# Install dependencies
cd apps/github-app
npm install

# Configure environment
cp .env.example .env
# Edit .env with your GitHub App credentials

# Start locally
npm run dev
```

See [apps/github-app/DEPLOY.md](apps/github-app/DEPLOY.md) for full deployment guide.

---

## 🧪 Examples

### Orchestrator Agent

```typescript
import { createOrchestrator } from './examples/orchestrator-agent';

const orchestrator = await createOrchestrator({
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Orchestrator automatically dispatches to Coder + Reviewer
const result = await orchestrator.dispatch({
  id: 'task-1',
  type: 'code',
  payload: { description: 'Implement user authentication' }
});
```

### Custom Agent

```typescript
import { createAgent, type Tool } from '@rubberduck/runtime';

const tools: Tool[] = [{
  name: 'search_code',
  description: 'Search for code patterns in the codebase',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string' }
    }
  }
}];

const agent = createAgent({
  name: 'searcher',
  model: 'openai/gpt-4o',
  tools,
  skills: ['search', 'analysis']
});
```

---

## 📊 Architecture

```
User Request
     ↓
┌─────────────────────────────────────┐
│         Agent Harness                │
│  ┌─────────────────────────────┐      │
│  │    Agent (createAgent)     │      │
│  │  - Session interface        │      │
│  │  - Tools (shell, fs, glob) │      │
│  │  - Skills system            │      │
│  └─────────────────────────────┘      │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│      Multi-Agent Pipeline           │
│                                     │
│  ┌────────────┐    ┌──────────┐    │
│  │ Orchestrator│ → │  Coder   │    │
│  │  (dispatch) │    │ (write)  │    │
│  └────────────┘    └──────────┘    │
│         ↓                          │
│  ┌────────────┐                    │
│  │  Reviewer   │ ← security, quality│
│  └────────────┘                    │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│       Sandbox Connectors             │
│                                     │
│  Local │ Virtual │ Daytona │ E2B   │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│        LLM Providers                │
│                                     │
│  OpenAI │ Anthropic │ MiniMax │ ... │
└─────────────────────────────────────┘
```

---

## 🛡️ Security

- **Sandbox Isolation** - Code execution in isolated environments
- **API Key Management** - Environment variables, never committed
- **Webhook Verification** - GitHub signature validation
- **Input Sanitization** - All user inputs sanitized

---

## 📈 Telemetry

Built-in OpenTelemetry support:

```typescript
import { initTelemetry } from '@rubberduck/opentelemetry';

const telemetry = await initTelemetry({
  serviceName: 'my-agent',
  otlpEndpoint: 'http://localhost:4318'
});

// Traces automatically created for:
// - LLM calls
// - Tool execution
// - Agent dispatch
// - Skill execution
```

---

## 📚 Documentation

- [AGENTS.md](AGENTS.md) - Agent architecture
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [INTEGRATION.md](INTEGRATION.md) - Integration guide
- [apps/github-app/DEPLOY.md](apps/github-app/DEPLOY.md) - GitHub App deployment

---

## 🤝 Contributing

Contributions welcome! See [AGENTS.md](AGENTS.md) for development guidelines.

---

## 📄 License

MIT License - See [LICENSE](LICENSE)

---

## 🦆 Powered By

- [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core) - Stateful agents
- [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai) - Unified LLM API
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - MCP support
- [`@opentelemetry/api`](https://www.npmjs.com/package/@opentelemetry/api) - Observability

---

<p align="center">
  <strong>Built with ❤️ in India</strong>
</p>