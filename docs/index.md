---
layout: home
title: Hanumate
titleTemplate: false

hero:
  name: "Hanumate"
  text: "Build Autonomous Coding Agents"
  tagline: A headless TypeScript framework for creating AI coding agents that work YOUR way.
  image:
    src: /logo.svg
    alt: Hanumate
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: npm Package
      link: https://www.npmjs.com/package/@kishkindhalabs/hanumate-runtime

features:
  - icon: ⚡
    title: Any LLM
    details: Use OpenAI, Anthropic, MiniMax, Groq, or any OpenAI-compatible API. Your choice, your models.

  - icon: 🔌
    title: MCP Support
    details: Built-in Model Context Protocol support. Connect to any MCP server seamlessly.

  - icon: 🏗️
    title: Sandboxed Execution
    details: Run agents in isolated environments — local, Daytona, or E2B. Safe code execution.

  - icon: 🔄
    title: Persistent State
    details: Hooks, beads, convoys — built-in work tracking that survives restarts.

  - icon: 🐕
    title: Watchdog Monitoring
    details: Automatic health checks, session recovery, and escalation handling.

  - icon: ⚗️
    title: Quality Gates
    details: Bors-style merge queue with bisecting. Keep your main branch always green.

  - icon: 💬
    title: Agent Communication
    details: Mail for persistent messages, Nudge for real-time sync between agents.

  - icon: 🔮
    title: Session Recovery
    details: Seance discovers and recovers agent sessions. Never lose context.
---

<div class="vp-doc">
  
## Install

```bash
# Core package (recommended)
npm install @kishkindhalabs/hanumate-runtime

# Everything
npm install @kishkindhalabs/hanumate-all
```

## Quick Example

```typescript
import { createAgent } from '@kishkindhalabs/hanumate-runtime';

const agent = createAgent({
  name: 'coder',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

const code = await agent.prompt('Write a REST API in TypeScript');
```

</div>