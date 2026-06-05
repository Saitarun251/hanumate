import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
    // CI mode: run once, no watch, exit on first failure
    mode: process.env.CI ? 'strict' : undefined,
    reporters: process.env.CI ? ['default', 'hanging-process'] : undefined,
  },
});