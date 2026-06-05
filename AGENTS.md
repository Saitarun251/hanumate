# RubberDuck Project Memory

## CLI Architecture

### Workflow Runner Implementation (2026-06-04)
Type: Implementation Pattern

Key decisions and patterns discovered when implementing the workflow runner:

1. **Typed Error Classes Pattern**
   - Created specialized error classes extending a base `WorkflowLoaderError`
   - Each error has an `errorType` field for programmatic handling
   - Enables proper HTTP status code mapping (400/404/422/500)

2. **Error Type to HTTP Status Mapping**
   | Error Type | HTTP Status |
   |-------------|-------------|
   | VALIDATION_ERROR | 400 |
   | NOT_FOUND | 404 |
   | INVALID_WORKFLOW | 422 |
   | EXECUTION_ERROR | 500 |

3. **JSON Payload Validation**
   - `parsePayload()` validates JSON syntax AND ensures payload is an object
   - Rejects arrays and primitives as invalid payloads
   - Throws `InvalidPayloadError` with clear message

4. **Workflow Loading Pattern**
   - Workflows located at `.rubberduck/workflows/:name.ts`
   - Directory search walks up to 10 levels from cwd
   - Dynamic `import()` with validation of `run()` function export

5. **CLI vs HTTP Error Handling**
   - CLI: exits with code 1 on failure, prints error to stderr
   - HTTP: returns JSON with `errorType` field for programmatic handling
   - Both share the same `executeWorkflow()` function

### Package Structure
- `packages/cli/` - Command-line interface
- `packages/runtime/` - Core agent runtime
- Workflows stored in project `.rubberduck/workflows/`
- Example workflows in `examples/*/`

### Dependencies Added
- `@hono/node-server` - For serving Hono app in dev command
- `hono` - Web framework for HTTP endpoints


---

## Shell Execution & Filesystem Implementation (2026-06-04)
Type: Implementation Pattern

Key decisions and patterns discovered when implementing shell execution and filesystem operations:

1. **Module Separation Pattern**
   - Created separate `shell.ts` and `fs.ts` modules for shell execution and filesystem operations
   - Each module has its own test file (`shell.test.ts`, `fs.test.ts`)
   - Enables independent testing and better code organization

2. **Environment Variable Inheritance**
   - Use `getDefaultEnv()` to capture system environment variables at agent creation
   - Merge custom env vars with defaults: `{ ...defaultEnv, ...customEnv }`
   - Custom values override system defaults (intentional design)

3. **Shell Execution Options Interface**
   ```typescript
   interface ExecOptions {
     cwd?: string;
     env?: Record<string, string>;
     timeout?: number;        // Default: 30000ms
     maxOutput?: number;      // Default: 1MB
     shell?: string;          // Platform-specific default
   }
   ```

4. **Large Output Handling**
   - Track cumulative output size
   - Truncate at maxOutput with warning message in stderr
   - For unlimited output, use `execStream()` with callbacks

5. **Filesystem Error Handling Pattern**
   - Custom `FSError` class with `code` property for error codes
   - Handle ENOENT (file not found), EACCES (permission denied), EISDIR (is directory), etc.
   - Consistent error messages with path included

6. **Glob Pattern Implementation**
   - Convert glob to regex with proper `**` handling (recursive)
   - Handle `**` before `*` to avoid double conversion
   - Skip hidden files by default unless `includeHidden: true`
   - Use `relative()` from node:path for proper path comparison

7. **Vitest Test Configuration**
   - Use `{ environment: 'node' }` in vitest.config.ts
   - Use `tmpdir()` for test files to avoid conflicts
   - Mock `@earendil-works/pi-agent-core` to avoid external API calls in tests

8. **Session Interface Extension Pattern**
   - Add new methods to Session interface in `harness.ts`
   - Implement methods by delegating to shell/fs modules
   - Pass merged environment and timeout config to shell operations

### Files Created
- `packages/runtime/src/shell.ts` - Shell execution module
- `packages/runtime/src/fs.ts` - Filesystem operations module
- `packages/runtime/test/shell.test.ts` - 15 shell tests
- `packages/runtime/test/fs.test.ts` - 31 filesystem tests
- `packages/runtime/test/harness.test.ts` - 17 harness integration tests

### Dependencies (existing)
- `just-bash` - Was already in package.json for shell operations
- `node:child_process` - Built-in Node.js module for process spawning
- `node:fs/promises` - Built-in Node.js module for filesystem operations
