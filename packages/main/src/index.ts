// @rubberduckharness - Meta-package bundling all RubberDuck packages
// 
// Usage:
//   npm install @rubberduckharness  # Everything
//   npm install @rubberduckharness/runtime  # Just core (recommended)
//   npm install @rubberduckharness/cli  # Just CLI
//
// This meta-package re-exports from all sub-packages.

export * from '@rubberduckharness/runtime';

// CLI re-exports (optional)
export { createCLI } from '@rubberduckharness/cli';

// SDK re-exports (optional)
export * from '@rubberduckharness/sdk';

// OpenTelemetry re-exports (optional)
export * from '@rubberduckharness/opentelemetry';