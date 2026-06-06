# Introduction

**Hanumate** is a headless TypeScript framework for building autonomous coding agents.

Unlike Claude Code or Copilot (which are applications with fixed behaviors), Hanumate is a **framework** — you define how your agents work.

## Why Hanumate?

- **You're in control** — Build agents exactly how you need them
- **Any model** — OpenAI, Anthropic, MiniMax, Groq, or any OpenAI-compatible API
- **Persistent** — Work queues, issue tracking, merge queues that survive restarts
- **Multi-agent** — Orchestrate multiple agents working together
- **Observable** — Built-in OpenTelemetry support for tracing and metrics

## Key Concepts

### Agents
Agents are autonomous units that can read code, write code, run tests, and interact with your codebase.

### Sessions
Each agent runs in a session — an isolated execution context with tools for file operations, shell commands, and more.

### Hooks
Persistent work queue. Assign tasks to agents and track progress across sessions.

### Beads
Git-backed issue tracking. Create, update, and reference issues by ID (rd-xxxxx).

### Convoys
Bundle related work together. Group multiple beads into a single deliverable.

### Watchdog
Health monitoring for agents. Automatic recovery and escalation on failures.

### Refinery
Bors-style merge queue with bisecting. Keep main branch always green.

## Packages

| Package | Description |
|---------|-------------|
| `@kishkindhalabs/hanumate-runtime` | Core framework — always needed |
| `@kishkindhalabs/hanumate-cli` | CLI tool for work management |
| `@kishkindhalabs/hanumate-sdk` | TypeScript SDK |
| `@kishkindhalabs/hanumate-opentelemetry` | Observability adapter |
| `@kishkindhalabs/hanumate-all` | All packages bundled |

## Next Steps

- [Installation](/guide/installation) — Set up Hanumate
- [Quick Start](/guide/quickstart) — Build your first agent
- [Agents](/guide/agents) — Learn about agent architecture