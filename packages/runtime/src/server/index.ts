/**
 * Server module exports
 *
 * HTTP and WebSocket servers for RubberDuck runtime.
 */

export {
	createServer,
	type HttpServerConfig,
	type HttpServer,
	type HealthResponse,
	type AgentPromptRequest,
	type AgentPromptResponse,
	type SessionInfoResponse,
} from './http-server.js';

export {
	WebSocketHandler,
	createWebSocketHandler,
	type WebSocketHandlerConfig,
	type WebSocketMessageType,
	type WebSocketIncomingMessage,
	type WebSocketOutgoingMessage,
	type WebSocketEventHandlers,
} from './websocket.js';

export {
	WorkflowRouter,
	createWorkflowRouter,
	type WorkflowDefinition,
	type WorkflowStep,
	type WorkflowStepHandler,
	type WorkflowContext,
	type WorkflowUser,
	type WorkflowStepResult,
	type WorkflowResult,
	type WorkflowRegistration,
	type Middleware,
	type AuthMiddlewareOptions,
	type LoggingMiddlewareOptions,
	type WorkflowLogEntry,
	type WorkflowRouterConfig,
} from './workflow-router.js';

export {
	MessageTrigger,
	createMessageTrigger,
	type MessageTriggerConfig,
	type IncomingMessage,
	type RoutingResult,
} from './message-trigger.js';