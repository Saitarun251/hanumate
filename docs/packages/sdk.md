# @hanumateharness/sdk

TypeScript SDK for building Hanumate integrations.

## Installation

```bash
npm install @hanumateharness/sdk
```

## Usage

```typescript
import { HanumateSDK } from '@kishkindhalabs/hanumate-sdk';

const sdk = new HanumateSDK({
  apiKey: process.env.HANUMATE_API_KEY
});

// Work with hooks
const hooks = await sdk.hooks.list();
const hook = await sdk.hooks.create({
  title: 'New task',
  type: 'feature'
});

// Work with beads
const beads = await sdk.beads.list({ status: 'open' });
const bead = await sdk.beads.create({
  title: 'New issue',
  type: 'bug'
});
```

## API Reference

### SDK Client

```typescript
const sdk = new HanumateSDK({
  apiKey: string,
  baseUrl?: string  // Optional, defaults to public API
});
```

### Hooks API

```typescript
// List hooks
const hooks = await sdk.hooks.list({
  status?: 'open' | 'assigned' | 'done'
});

// Create hook
const hook = await sdk.hooks.create({
  title: string,
  type: 'bug' | 'feature' | 'chore' | 'refactor',
  priority?: 'P1' | 'P2' | 'P3' | 'P4'
});

// Get hook
const hook = await sdk.hooks.get('hk-abc123');

// Update hook
await sdk.hooks.update('hk-abc123', {
  status: 'assigned',
  assignee: 'agent-1'
});
```

### Beads API

```typescript
// List beads
const beads = await sdk.beads.list({
  status?: 'open' | 'in_progress' | 'closed',
  type?: 'bug' | 'feature' | 'chore' | 'refactor'
});

// Create bead
const bead = await sdk.beads.create({
  title: string,
  type: 'feature',
  priority?: 'P1' | 'P2' | 'P3' | 'P4'
});

// Get bead
const bead = await sdk.beads.get('rd-xyz789');

// Update bead
await sdk.beads.update('rd-xyz789', {
  status: 'in_progress'
});
```