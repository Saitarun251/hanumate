# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-06-04

### Added

#### Core Runtime (@kishkindhalabs/hanumate-runtime)

- **Skills System**
  - `Session.runSkill()` - Execute skills with full context
  - `Session.getSkillInstructions()` - Get skill instructions for prompt injection
  - `Session.listSkills()` - List available skills
  - Skills loaded from `.hanumate/.agents/skills/:skill-name/SKILL.md`
  - YAML frontmatter support with name, description, tools metadata

- **MCP (Model Context Protocol) Integration**
  - `connectMCP()` - Connect to a single MCP server
  - `connectMCPServers()` - Connect to multiple MCP servers
  - Support for SSE transport (HTTP endpoints)
  - Support for Stdio transport (local process spawning)
  - MCP tools automatically merged with agent tools
  - Tools prefixed with server name to avoid conflicts

- **Sandbox Connectors**
  - `LocalSandbox` - Real shell and filesystem execution
  - `VirtualSandbox` - In-memory filesystem and shell emulation
  - `DaytonaSandbox` - Container-based execution via Daytona API
  - `E2BSandbox` - Cloud sandbox execution via E2B API
  - `createSandbox()` - Factory function for sandbox creation

- **Session Persistence**
  - `SessionStore` interface for persistence implementations
  - `InMemorySessionStore` - Node.js Map-based storage
  - `DurableObjectSessionStore` - Cloudflare Durable Objects storage
  - Session message history auto-save
  - TTL (Time-To-Live) expiration support
  - `getHistory()`, `clearHistory()`, `save()` methods on Session

- **Shell Execution**
  - `Session.shell()` - Execute shell commands
  - Environment variable inheritance with defaults
  - Configurable timeout and output limits
  - Stream support for large outputs
  - Proper error handling with exit codes

- **Filesystem Operations**
  - `Session.fs` - Filesystem interface
  - `read()`, `write()`, `mkdir()`, `remove()`, `listDir()`, `glob()`, `exists()`
  - Proper error handling with error codes (ENOENT, EACCES, etc.)
  - Hidden file filtering option

#### OpenTelemetry (@kishkindhalabs/hanumate-opentelemetry)

- `initTelemetry()` - Initialize OpenTelemetry tracing
- `shutdownTelemetry()` - Graceful shutdown
- `traceProvider` helper
- Instrumented operations:
  - Session prompts
  - Shell commands
  - Filesystem operations
  - MCP operations
  - Skill execution
  - Workflow execution
- Console and OTLP exporters
- Configurable sampling

#### CLI (@kishkindhalabs/hanumate-cli)

- `duck dev` - Start development server with WebSocket support
- `duck run <workflow>` - Execute workflows from CLI
- `duck build --target <node|cloudflare>` - Build for production
- `duck connect <name> <id>` - Connect to agent instances
- HTTP endpoints:
  - `GET /` - Health check
  - `GET /agents/:name/:id` - Agent info
  - `POST /agents/:name/:id` - Send message
  - `GET /workflows/:name` - Workflow info
  - `POST /workflows/:name` - Execute workflow
- WebSocket endpoint: `ws://localhost:3583/agents/:name/:id?token=<token>`

#### Build System

- `src/build/node.ts` - Node.js target with esbuild bundler
- `src/build/cloudflare.ts` - Cloudflare Workers target with Vite
- `src/build/index.ts` - Build dispatcher
- Multi-target support in CLI

#### Provider Configuration

- `configureProvider()` - Configure a single provider
- `getConfiguredProvider()` - Get provider by ID
- `configureGateway()` - Configure provider gateway
- Enterprise presets:
  - AWS Bedrock
  - Azure OpenAI
  - Google Vertex AI
- Gateway support for unified provider access

### Fixed

- TypeScript compilation errors in harness.ts
- MCP Client constructor argument order
- Workflow loader directory search path
- JSON payload validation for arrays and primitives

### Dependencies Updated

- `@modelcontextprotocol/sdk` ^1.29.0
- `@opentelemetry/*` ^1.30.1 / ^0.218.0
- `hono` ^4.8.3
- `@hono/node-server` ^1.13.7
- `ws` ^8.20.0
- `valibot` ^1.1.0

### Test Coverage

- 206 tests passing across runtime package
- Tests for:
  - Skills system (11 tests)
  - Sandbox connectors (38 tests)
  - Session store (15 tests)
  - Shell execution (15 tests)
  - Filesystem operations (31 tests)
  - Harness integration (17 tests)
