/**
 * Hook System - Exports
 * 
 * Persistent work queue for agents. GUPP principle: "If work is on your Hook, you run it."
 */

// Store implementations - these carry the type info
export { HookStore, InMemoryHookStore } from './hook-store.js';

// Manager - these carry the type info
export { HookManager, createHookManager } from './hook-manager.js';
export type { HookManagerConfig } from './hook-manager.js';

// Re-export types for convenience (using type keyword for clarity)
export type { Hook, HookStatus, HookCreateOptions, HookUpdateOptions, HookStore as HookStoreInterface, HookManager as HookManagerInterface } from './hook-types.js';
export { generateHookId, createHook } from './hook-types.js';