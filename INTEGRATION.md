# Hanumate Integration Summary

This document describes how all components of the Hanumate system connect together.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Hanumate                                │
├─────────────────────────────────────────────────────────────────────┤
│  Harness                                                              │
│  ├── Agent (pi-agent-core stub)                                      │
│  ├── Session                                                          │
│  │   ├── prompt() → LLM execution with tracing                       │
│  │   ├── shell() → Shell commands with sandbox support               │
│  │   ├── fs operations → Filesystem with sandbox support            │
│  │   ├── skills → Skill loader and execution                         │
│  │   └── history → Session persistence                              │
│  ├── MCP Tools → Model Context Protocol integration                  │
│  └── Provider → LLM provider selection and fallback                  │
├─────────────────────────────────────────────────────────────────────┤
│  Connectors                                                           │
│  ├── Local (real shell/fs)                                           │
│  ├── Virtual (in-memory)                                              │
│  ├── Daytona (container API)                                        │
│  └── E2B (cloud sandbox API)                                         │
├─────────────────────────────────────────────────────────────────────┤
│  Observability                                                        │
│  ├── OpenTelemetry tracing                                           │
│  ├── Session prompt tracing                                          │
│  ├── Shell command tracing                                           │
│  ├── Filesystem operation tracing                                     │
│  └── MCP operation tracing                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Harness (`src/harness.ts`)

The `Harness` is the main entry point that orchestrates all components:

```typescript
const harness = await init(agent, {
  name: 'my-agent',
  config: {
    skills: ['skill1', 'skill2'],
    sandbox: { type: 'local' },
    telemetry: { enabled: true },
    provider: { id: 'anthropic' }
  }
});
```

**Key Interfaces:**
- `HanumateConfig` - Configuration for the harness
- `HanumateAgent` - Agent definition
- `Harness` - Main interface with `session()`, `shutdown()`
- `Session` - User-facing API

### 2. Session (`src/harness.ts`)

The `Session` provides the user-facing API for interacting with the agent:

```typescript
const session = harness.session();

// Prompt the agent
const response = await session.prompt("Hello, how are you?");

// Execute shell commands
const result = await session.shell("ls -la");

// Filesystem operations
await session.writeFile("/path/to/file.txt", "content");
const content = await session.readFile("/path/to/file.txt");

// Skill execution
await session.runSkill("my-skill", { context: "data" });
```

**Session Methods:**
- `prompt(message)` - Send a message to the agent
- `shell(command, cwd?)` - Execute shell commands
- `readFile(path, options?)` - Read file contents
- `writeFile(path, content, options?)` - Write file contents
- `mkdir(path, options?)` - Create directories
- `readDir(path, options?)` - List directory contents
- `copyFile(src, dest)` - Copy files
- `deleteFile(path)` - Delete files
- `moveFile(src, dest)` - Move files
- `glob(pattern, options?)` - Find files matching pattern
- `runSkill(name, context?)` - Execute a skill
- `listSkills()` - List available skills
- `getHistory()` - Get message history
- `save()` - Save session state

### 3. Telemetry (`src/telemetry.ts`, `src/observability.ts`)

OpenTelemetry integration provides distributed tracing:

```typescript
import { initTelemetry, shutdownTelemetry } from '@hanumate/runtime';

// Initialize with configuration
initTelemetry({
  enabled: true,
  serviceName: 'my-agent',
  exporter: 'console', // or 'otlp'
  endpoint: 'http://localhost:4318/v1/traces'
});

// All operations are automatically traced
// - session.prompt() → 'session.prompt' span
// - session.shell() → 'shell.exec' span
// - fs operations → 'fs.read', 'fs.write', etc.
```

**Trace Attributes:**
- `llm.model` - Model used for LLM calls
- `llm.prompt_length` - Prompt token count
- `llm.response_length` - Response token count
- `shell.command` - Shell command executed
- `shell.exit_code` - Exit code of command
- `fs.operation` - Filesystem operation type
- `fs.path` - Path involved in operation
- `mcp.server_name` - MCP server name
- `mcp.operation` - MCP operation type

### 4. Sandbox Connectors (`src/connectors/index.ts`)

Sandbox connectors provide isolated execution environments:

```typescript
import { createSandbox } from '@hanumate/runtime';

// Local sandbox (real shell/fs)
const localSandbox = createSandbox('local');

// Virtual sandbox (in-memory)
const virtualSandbox = createSandbox('virtual');

// Daytona container sandbox
const daytonaSandbox = createSandbox('daytona', { apiKey: '...' });

// E2B cloud sandbox
const e2bSandbox = createSandbox('e2b', { apiKey: '...' });
```

### 5. MCP Integration (`src/mcp.ts`)

Model Context Protocol enables tool integrations:

```typescript
const harness = await init(agent, {
  config: {
    mcpServers: [
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
      }
    ]
  }
});
```

### 6. Skills System (`src/skills.ts`)

Skills provide reusable agent capabilities:

```typescript
// Skills are stored in .hanumate/.agents/skills/:skill-name/SKILL.md
// SKILL.md format:
/*
---
name: my-skill
description: Description of the skill
tools: [tool1, tool2]
---

Instructions for the skill go here...
*/

// Load skills
const skills = await loadAgentSkills(['skill1', 'skill2'], '/project/path');

// Execute skill
const result = await session.runSkill('skill-name', { context: 'data' });
```

### 7. Provider System (`src/provider-config.ts`)

LLM provider configuration with fallback support:

```typescript
const harness = await init(agent, {
  config: {
    provider: {
      id: 'anthropic',
      baseURL: 'https://api.anthropic.com',
      fallbackProviders: ['openai']
    }
  }
});
```

**Supported Providers:**
- `openai` - OpenAI GPT models
- `anthropic` - Anthropic Claude models
- `google` - Google Gemini models
- `ollama` - Local Ollama models
- `lmstudio` - Local LM Studio models
- Enterprise: AWS Bedrock, Azure OpenAI, Vertex AI

### 8. Session Persistence (`src/session-store.ts`)

Session persistence for state management:

```typescript
import { InMemorySessionStore } from '@hanumate/runtime';

const harness = await init(agent, {
  config: {
    sessionStore: {
      store: new InMemorySessionStore({ defaultTTL: 24 * 60 * 60 * 1000 }),
      sessionId: 'my-session-id'
    }
  }
});
```

## Configuration Reference

```typescript
interface HanumateConfig {
  name?: string;                    // Agent name
  model?: string;                   // Model identifier
  apiKey?: string;                  // API key
  baseUrl?: string;                // Custom base URL
  providerId?: string;             // Provider ID
  env?: Record<string, string>;    // Environment variables
  shellTimeout?: number;           // Shell timeout (ms)
  skills?: string[];               // Skill names to load
  basePath?: string;              // Base path for skills
  mcpServers?: MCPServerConfig[]; // MCP server configurations
  sandbox?: {                     // Sandbox configuration
    type: 'local' | 'virtual' | 'daytona' | 'e2b';
    apiKey?: string;
    baseUrl?: string;
    template?: string;
  };
  telemetry?: TelemetryConfig;     // Telemetry configuration
  provider?: {                     // Provider configuration
    id?: string;
    baseURL?: string;
    apiKey?: string;
    fallbackProviders?: string[];
  };
  gateway?: GatewayConfig;         // Gateway configuration
  sessionStore?: {                 // Session store configuration
    store: SessionStore;
    sessionId?: string;
    defaultTTL?: number | null;
  };
}

interface TelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  serviceVersion?: string;
  endpoint?: string;
  exporter?: 'console' | 'otlp';
  sampling?: 'always' | 'never' | 'ratio';
  sampleRatio?: number;
}
```

## TypeScript Compilation

The project compiles cleanly with TypeScript:

```bash
cd packages/runtime
./node_modules/.bin/tsc --noEmit
# No errors
```

## Test Suite

All 206 tests pass:

```bash
cd packages/runtime
npm test

# Test Files  8 passed (8)
# Tests  206 passed (206)
```

## E2E Verification

The end-to-end test demonstrates full integration:

```bash
cd packages/runtime
npx tsx e2e-test.ts

# === All tests passed! ===
```

This verifies:
1. Telemetry initialization
2. Agent creation
3. Local sandbox creation
4. Harness initialization
5. Session shell execution
6. Filesystem operations (mkdir, read, write, delete)
7. Path utilities
8. Clean shutdown with telemetry traces

## File Structure

```
packages/
├── runtime/
│   ├── src/
│   │   ├── index.ts              # Main exports
│   │   ├── harness.ts            # Harness and Session
│   │   ├── telemetry.ts          # OpenTelemetry integration
│   │   ├── observability.ts      # Tracing utilities
│   │   ├── skills.ts            # Skill loader
│   │   ├── mcp.ts               # MCP integration
│   │   ├── shell.ts             # Shell execution
│   │   ├── fs.ts                # Filesystem operations
│   │   ├── providers.ts         # LLM providers
│   │   ├── provider-config.ts   # Provider configuration
│   │   ├── provider-manager.ts  # Provider manager
│   │   ├── session-store.ts     # Session persistence
│   │   ├── connectors/
│   │   │   └── index.ts         # Sandbox connectors
│   │   └── types.ts             # Type definitions
│   └── test/                    # Test files
└── opentelemetry/
    └── src/
        └── index.ts             # Setup helpers
```

## Dependencies

**Runtime package.json dependencies:**
- `@earendil-works/pi-agent-core` - Agent core
- `@earendil-works/pi-ai` - AI utilities
- `@modelcontextprotocol/sdk` - MCP protocol
- `@opentelemetry/api` - OpenTelemetry API
- `@opentelemetry/sdk-trace-node` - Node.js tracer
- `@opentelemetry/sdk-trace-base` - Tracer base
- `@opentelemetry/exporter-trace-otlp-http` - OTLP exporter
- `@opentelemetry/resources` - Resource definitions
- `@opentelemetry/semantic-conventions` - Semantic conventions
- `hono` - Web framework
- `just-bash` - Shell execution
- `valibot` - Validation

**Dev dependencies:**
- `typescript` - TypeScript compiler
- `vitest` - Test framework
- `tsdown` - Build tool
- `@types/node` - Node.js types