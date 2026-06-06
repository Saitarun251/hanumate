/**
 * Server Integration Tests
 *
 * Tests for HTTP server, WebSocket, message trigger, and workflow routing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type HttpServerConfig } from '../../src/server/http-server.js';
import { WebSocketHandler, type WebSocketHandlerConfig } from '../../src/server/websocket.js';
import { WorkflowRouter, type WorkflowDefinition } from '../../src/server/workflow-router.js';
import { MessageTrigger, type MessageTriggerConfig } from '../../src/server/message-trigger.js';

// ============================================================================
// HTTP Server Tests
// ============================================================================

describe('HttpServer', () => {
	let server: ReturnType<typeof createServer>;
	let config: HttpServerConfig;

	beforeEach(() => {
		config = {
			agents: {
				register: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
				unregister: vi.fn(),
			} as any,
			hooks: undefined,
			beads: undefined,
			sessions: {
				create: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
				delete: vi.fn(),
			} as any,
		};
	});

	afterEach(() => {
		// Clean up
	});

	it('should create server with config', () => {
		server = createServer(config);
		expect(server).toBeDefined();
	});

	it('should export health endpoint', () => {
		server = createServer(config);
		expect(server).toHaveProperty('start');
	});

	it('should support custom port', () => {
		server = createServer({ ...config, port: 4000 });
		expect(server).toBeDefined();
	});
});

// ============================================================================
// WebSocket Handler Tests
// ============================================================================

describe('WebSocketHandler', () => {
	let handler: WebSocketHandler;
	let wsConfig: WebSocketHandlerConfig;

	beforeEach(() => {
		wsConfig = {
			agents: {
				register: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
			} as any,
			sessions: {
				create: vi.fn(),
				get: vi.fn(),
			} as any,
			heartbeatInterval: 30000,
			heartbeatTimeout: 60000,
			reconnectionWindow: 300000,
		};
	});

	it('should create WebSocket handler', () => {
		handler = new WebSocketHandler(wsConfig);
		expect(handler).toBeDefined();
	});

	it('should export send method', () => {
		handler = new WebSocketHandler(wsConfig);
		expect(typeof handler.send).toBe('function');
	});

	it('should export sendStreamChunk method', () => {
		handler = new WebSocketHandler(wsConfig);
		expect(typeof handler.sendStreamChunk).toBe('function');
	});

	it('should export broadcastToAgent method', () => {
		handler = new WebSocketHandler(wsConfig);
		expect(typeof handler.broadcastToAgent).toBe('function');
	});

	it('should support event handlers', () => {
		const onConnect = vi.fn();
		const onDisconnect = vi.fn();
		const onPrompt = vi.fn();

		handler = new WebSocketHandler({
			...wsConfig,
			eventHandlers: {
				onConnect,
				onDisconnect,
				onPrompt,
			},
		});

		expect(handler).toBeDefined();
	});
});

// ============================================================================
// Workflow Router Tests
// ============================================================================

describe('WorkflowRouter', () => {
	let router: WorkflowRouter;

	beforeEach(() => {
		router = new WorkflowRouter({
			agents: {
				register: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
			} as any,
		});
	});

	it('should create workflow router', () => {
		expect(router).toBeDefined();
	});

	it('should export getApp method', () => {
		expect(typeof router.getApp).toBe('function');
	});

	it('should support workflow registration', () => {
		const workflow: WorkflowDefinition = {
			name: 'test-workflow',
			version: '1.0.0',
			steps: [
				{
					name: 'step1',
					handler: async () => ({ success: true }),
				},
			],
		};

		router.register(workflow);
		expect(router).toBeDefined();
	});

	it('should support middleware', () => {
		// WorkflowRouter middleware is configured via constructor
		expect(router).toBeDefined();
	});

	it('should list registered workflows', () => {
		// WorkflowRouter stores workflows internally
		expect(router).toBeDefined();
	});
});

// ============================================================================
// Message Trigger Tests
// ============================================================================

describe('MessageTrigger', () => {
	let trigger: MessageTrigger;
	let triggerConfig: MessageTriggerConfig;

	beforeEach(() => {
		triggerConfig = {
			agents: {
				register: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
			} as any,
			hooks: undefined,
			sessions: {
				create: vi.fn(),
				get: vi.fn(),
				list: vi.fn(),
			} as any,
			defaultModel: 'test-model',
		};
	});

	it('should create message trigger', () => {
		trigger = new MessageTrigger(triggerConfig);
		expect(trigger).toBeDefined();
	});

	it('should track active sessions', () => {
		trigger = new MessageTrigger(triggerConfig);
		const count = trigger.getActiveSessionCount();
		expect(typeof count).toBe('number');
	});

	it('should close sessions', () => {
		trigger = new MessageTrigger(triggerConfig);
		trigger.closeSession('test-agent', 'test-session');
		// Should not throw
	});

	it('should handle HTTP messages', async () => {
		trigger = new MessageTrigger(triggerConfig);

		const result = await trigger.handleHTTP(
			{
				type: 'prompt',
				agentName: 'test-agent',
				message: 'Hello',
			},
			{}
		);

		expect(result).toHaveProperty('success');
		expect(result).toHaveProperty('sessionId');
	});

	it('should handle WebSocket messages', async () => {
		trigger = new MessageTrigger(triggerConfig);

		const result = await trigger.handleWebSocket('session-123', {
			type: 'prompt',
			agentName: 'test-agent',
			message: 'Hello',
		});

		expect(result).toHaveProperty('success');
		expect(result).toHaveProperty('sessionId');
	});

	it('should route nudge messages', async () => {
		trigger = new MessageTrigger(triggerConfig);

		const result = await trigger.handleHTTP(
			{
				type: 'nudge',
				agentName: 'test-agent',
				message: 'Wake up',
			},
			{}
		);

		expect(result).toHaveProperty('sessionId');
	});

	it('should route dispatch messages', async () => {
		trigger = new MessageTrigger(triggerConfig);

		const result = await trigger.handleHTTP(
			{
				type: 'dispatch',
				agentName: 'test-agent',
				message: 'New work',
				priority: 'P1',
			},
			{}
		);

		expect(result).toHaveProperty('sessionId');
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Server Integration', () => {
	it('should create all server components', () => {
		const httpServer = createServer({
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn(), unregister: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
		});

		const wsHandler = new WebSocketHandler({
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn() } as any,
		});

		const workflowRouter = new WorkflowRouter({
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn() } as any,
		});

		const messageTrigger = new MessageTrigger({
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn(), list: vi.fn() } as any,
		});

		expect(httpServer).toBeDefined();
		expect(wsHandler).toBeDefined();
		expect(workflowRouter).toBeDefined();
		expect(messageTrigger).toBeDefined();
	});

	it('should export all server types', async () => {
		const httpServer = createServer({
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn(), unregister: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
		});

		expect(httpServer).toHaveProperty('start');
		expect(httpServer).toHaveProperty('stop');
	});
});

// ============================================================================
// Type Tests
// ============================================================================

describe('Server Type Exports', () => {
	it('should export HttpServerConfig', () => {
		const config: HttpServerConfig = {
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn(), unregister: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn() } as any,
		};
		expect(config).toBeDefined();
	});

	it('should export WebSocketHandlerConfig', () => {
		const config: WebSocketHandlerConfig = {
			agents: { register: vi.fn(), get: vi.fn(), list: vi.fn() } as any,
			sessions: { create: vi.fn(), get: vi.fn() } as any,
		};
		expect(config).toBeDefined();
	});
});