/**
 * Nudge Module - Real-time agent wake-up via WebSocket
 *
 * Provides WebSocket client and server capabilities for agent-to-agent
 * nudging with auto-reconnection, heartbeat, and message delivery.
 */

// Re-export types
export type { NudgeMessage, NudgeType, NudgePayload, NudgeConfig, NudgeHandler, NudgeConnection, NudgeFilter, NudgeConnectionState, CreateNudgeOptions } from './nudge-types.js';

// Re-export type utilities
export { generateNudgeId, isValidNudgeId, createNudge } from './nudge-types.js';

// Re-export client
export { NudgeClient, type NudgeClientConfig } from './nudge-client.js';

// Re-export server
export { NudgeServer, createNudgeServer } from './nudge-server.js';