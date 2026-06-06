// @kishkindhalabs/hanumate - Meta-package bundling all Hanumate packages
// 
// Usage:
//   npm install @kishkindhalabs/hanumate  # Everything
//   npm install @kishkindhalabs/hanumate-runtime  # Just core (recommended)
//   npm install @kishkindhalabs/hanumate-cli  # Just CLI
//
// This meta-package re-exports from all sub-packages.

export * from '@kishkindhalabs/hanumate-runtime';

// CLI re-exports (optional)
export { createCLI } from '@kishkindhalabs/hanumate-cli';

// SDK re-exports (optional)
export * from '@kishkindhalabs/hanumate-sdk';

// OpenTelemetry re-exports (optional)
export * from '@kishkindhalabs/hanumate-opentelemetry';