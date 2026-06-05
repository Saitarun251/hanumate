# GitHub App Tests

Comprehensive test suite for the RubberDuck GitHub App.

## Structure

```
test/
├── agents/
│   ├── coder.test.ts      # Coder agent tests
│   └── reviewer.test.ts   # Reviewer agent tests
├── config/
│   └── repo-config.test.ts # Repository configuration tests
├── handlers/
│   ├── webhook.test.ts    # Webhook event handlers
│   └── signature.test.ts  # Webhook signature validation
├── integration/
│   └── scenarios.test.ts  # End-to-end integration scenarios
├── orchestrator/
│   └── orchestrator.test.ts # Task orchestration logic
└── setup.ts               # Test utilities and mocks
```

## Running Tests

```bash
# From the github-app directory
npm test

# Or with vitest directly
npx vitest run

# Watch mode
npx vitest
```

## Coverage

- Webhook handlers for PR, issues, comments, check runs
- Orchestrator task routing and agent coordination
- Coder agent implementation and code generation
- Reviewer agent code review and approval logic
- Repository configuration validation and path matching
- Integration scenarios for complete workflows