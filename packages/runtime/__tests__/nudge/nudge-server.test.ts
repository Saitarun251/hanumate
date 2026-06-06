/**
 * Nudge Server Tests
 * Tests for the Nudge WebSocket server.
 * Uses real WebSocket connections for integration testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { NudgeServer, createNudgeServer } from '../../src/nudge/nudge-server.js';

describe('NudgeServer', () => {
	// ─── Constructor ─────────────────────────────────────────────────────────────

	describe('constructor', () => {
		it('should create server with default configuration', () => {
			const server = new NudgeServer();
			expect(server).toBeDefined();
		});

		it('should create server with custom configuration', () => {
			const server = new NudgeServer({
				port: 9999,
				host: '127.0.0.1',
				path: '/test',
				heartbeatInterval: 15000,
				connectionTimeout: 30000,
			});
			expect(server).toBeDefined();
		});

		it('should apply default values for missing config options', () => {
			const server = new NudgeServer({ port: 7000, host: '127.0.0.1' });
			expect(server).toBeDefined();
		});

		it('should create server via factory function', () => {
			const server = createNudgeServer({ port: 7001, host: '127.0.0.1' });
			expect(server).toBeDefined();
		});
	});

	// ─── Server lifecycle ────────────────────────────────────────────────────────

	describe('server lifecycle', () => {
		it('should start and stop server successfully', async () => {
			const server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();
			expect(server.getStatus().running).toBe(true);

			await server.stop();
			expect(server.getStatus().running).toBe(false);
		});

		it('should throw error when starting already running server', async () => {
			const server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();

			await expect(server.start()).rejects.toThrow('NudgeServer is already running');
			await server.stop();
		});

		it('should stop gracefully when not running', async () => {
			const server = new NudgeServer({ port: 7002, host: '127.0.0.1', heartbeatInterval: 60000 });
			await expect(server.stop()).resolves.toBeUndefined();
		});

		it('should allocate random port when port 0 is specified', async () => {
			const server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();
			const status = server.getStatus();
			expect(status.running).toBe(true);
			expect(status.port).toBeGreaterThan(0);
			await server.stop();
		});
	});

	// ─── Connection handling ─────────────────────────────────────────────────────

	describe('connection handling', () => {
		let server: NudgeServer;

		beforeEach(async () => {
			server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();
		}, 10000);

		afterEach(async () => {
			// Force-close all WebSocket connections before stopping
			try {
				await server.stop();
			} catch {
				// Ignore stop errors
			}
		}, 10000);

		it('should accept client connection and send registration challenge', async () => {
			const port = server.getPort();
			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			const challenge = await new Promise<unknown>((resolve) => {
				ws.on('message', (data) => {
					resolve(JSON.parse(data.toString()));
				});
			});

			expect(challenge).toMatchObject({ type: 'register' });
			expect((challenge as { payload: { connectionId: string } }).payload.connectionId).toMatch(/^nudge-/);
			ws.close();
		});

		it('should register agent and call onConnect handler', async () => {
			const port = server.getPort();
			const connectHandler = vi.fn();
			server.onConnect(connectHandler);

			const ws = new WebSocket(`ws://127.0.0.1:${port}`);
			let registered = false;

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register' && !registered) {
						registered = true;
						ws.send(JSON.stringify({ type: 'register', agentId: 'test-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			expect(connectHandler).toHaveBeenCalledTimes(1);
			expect(connectHandler).toHaveBeenCalledWith(
				expect.objectContaining({ agentId: 'test-agent', active: true })
			);
			ws.close();
		});

		it('should track connected agents', async () => {
			const port = server.getPort();
			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register') {
						ws.send(JSON.stringify({ type: 'register', agentId: 'tracker-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			expect(server.isAgentConnected('tracker-agent')).toBe(true);
			expect(server.getConnectedAgents()).toContain('tracker-agent');
			ws.close();
		});

		it('should call onDisconnect handler when client closes', async () => {
			const port = server.getPort();
			const disconnectHandler = vi.fn();
			server.onDisconnect(disconnectHandler);

			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register') {
						ws.send(JSON.stringify({ type: 'register', agentId: 'disconnect-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			ws.close();

			await new Promise((r) => setTimeout(r, 50));
			expect(disconnectHandler).toHaveBeenCalledTimes(1);
			expect(disconnectHandler).toHaveBeenCalledWith(
				expect.objectContaining({ agentId: 'disconnect-agent', active: false })
			);
		});

		it('should remove agent from connected list after disconnect', async () => {
			const port = server.getPort();
			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register') {
						ws.send(JSON.stringify({ type: 'register', agentId: 'temp-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			expect(server.isAgentConnected('temp-agent')).toBe(true);
			ws.close();
			await new Promise((r) => setTimeout(r, 50));
			expect(server.isAgentConnected('temp-agent')).toBe(false);
		});
	});

	// ─── Message sending ────────────────────────────────────────────────────────

	describe('message sending', () => {
		let server: NudgeServer;
		let serverPort: number;

		beforeEach(async () => {
			server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();
			serverPort = server.getPort();
		}, 10000);

		afterEach(async () => {
			try {
				await server.stop();
			} catch {
				// Ignore
			}
		}, 10000);

		it('should send nudge to specific agent', async () => {
			const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`);

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register') {
						ws.send(JSON.stringify({ type: 'register', agentId: 'target-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			// Send nudge via server
			const nudge = {
				id: 'nudge-test1',
				from: 'sender',
				to: 'target-agent',
				type: 'wake' as const,
				payload: { task: 'test' },
				createdAt: Date.now(),
			};
			const sent = server.send('target-agent', nudge);
			expect(sent).toBe(true);

			// Client should receive nudge
			const received = await new Promise<unknown>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'nudge') {
						resolve(msg.payload);
					}
				});
			});

			expect(received).toMatchObject({ id: 'nudge-test1', from: 'sender', to: 'target-agent' });
			ws.close();
		});

		it('should return false when sending to unknown agent', () => {
			const nudge = {
				id: 'nudge-unknown',
				from: 'sender',
				to: 'unknown-agent',
				type: 'wake' as const,
				payload: {},
				createdAt: Date.now(),
			};
			const sent = server.send('unknown-agent', nudge);
			expect(sent).toBe(false);
		});

		it('should broadcast nudge to all connected agents', async () => {
			const ws1 = new WebSocket(`ws://127.0.0.1:${serverPort}`);
			const ws2 = new WebSocket(`ws://127.0.0.1:${serverPort}`);
			const received1: unknown[] = [];
			const received2: unknown[] = [];

			// Wait for both connections to be open
			await Promise.all([
				new Promise<void>((resolve) => { ws1.on('open', () => resolve()); }),
				new Promise<void>((resolve) => { ws2.on('open', () => resolve()); }),
			]);

			// Set up nudge handlers
			ws1.on('message', (data) => {
				const msg = JSON.parse(data.toString());
				if (msg.type === 'nudge') received1.push(msg.payload);
			});
			ws2.on('message', (data) => {
				const msg = JSON.parse(data.toString());
				if (msg.type === 'nudge') received2.push(msg.payload);
			});

			// Wait for both clients to register
			await new Promise<void>((resolve, reject) => {
				let resolved = false;
				const check = () => {
					if (resolved) return;
					if (server.isAgentConnected('client1') && server.isAgentConnected('client2')) {
						resolved = true;
						resolve();
					}
				};
				ws1.on('message', () => check());
				ws2.on('message', () => check());
				ws1.send(JSON.stringify({ type: 'register', agentId: 'client1' }));
				ws2.send(JSON.stringify({ type: 'register', agentId: 'client2' }));
				setTimeout(() => {
					if (!resolved) {
						reject(new Error('Registration timeout'));
					}
				}, 3000);
			});

			await new Promise((r) => setTimeout(r, 30));

			const nudge = {
				id: 'nudge-bcast',
				from: 'broadcaster',
				to: '*',
				type: 'interrupt' as const,
				payload: { msg: 'all agents' },
				createdAt: Date.now(),
			};
			server.broadcast(nudge);

			await new Promise((r) => setTimeout(r, 50));
			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
			expect(received1[0]).toMatchObject({ id: 'nudge-bcast' });
			ws1.close();
			ws2.close();
		});
	});

	// ─── Event handlers ─────────────────────────────────────────────────────────

	describe('event handlers', () => {
		let server: NudgeServer;

		beforeEach(async () => {
			server = new NudgeServer({ port: 0, host: '127.0.0.1', heartbeatInterval: 60000 });
			await server.start();
		}, 10000);

		afterEach(async () => {
			try {
				await server.stop();
			} catch {
				// Ignore
			}
		}, 10000);

		it('should call onNudge handler when nudge is received', async () => {
			const port = server.getPort();
			const nudgeHandler = vi.fn();
			server.onNudge(nudgeHandler);

			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			await new Promise<void>((resolve) => {
				ws.on('message', (data) => {
					const msg = JSON.parse(data.toString());
					if (msg.type === 'register') {
						ws.send(JSON.stringify({ type: 'register', agentId: 'nudge-handler-agent' }));
					} else if (msg.type === 'registered') {
						resolve();
					}
				});
			});

			const nudge = {
				id: 'nudge-handler1',
				from: 'some-agent',
				to: 'nudge-handler-agent',
				type: 'work' as const,
				payload: { data: 'test' },
				createdAt: Date.now(),
			};
			ws.send(JSON.stringify({ type: 'nudge', payload: nudge }));

			await new Promise((r) => setTimeout(r, 30));
			expect(nudgeHandler).toHaveBeenCalledTimes(1);
			expect(nudgeHandler).toHaveBeenCalledWith(expect.objectContaining({ id: 'nudge-handler1' }));
			ws.close();
		});

		it('should handle multiple clients with different handlers', async () => {
			const port = server.getPort();
			const nudgeHandler = vi.fn();
			server.onNudge(nudgeHandler);

			const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
			const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);

			// Wait for both connections to open
			await Promise.all([
				new Promise<void>((resolve) => { ws1.on('open', () => resolve()); }),
				new Promise<void>((resolve) => { ws2.on('open', () => resolve()); }),
			]);

			// Wait for both clients to register
			await new Promise<void>((resolve, reject) => {
				let resolved = false;
				const check = () => {
					if (resolved) return;
					if (server.isAgentConnected('multi-agent-1') && server.isAgentConnected('multi-agent-2')) {
						resolved = true;
						resolve();
					}
				};
				ws1.on('message', () => check());
				ws2.on('message', () => check());
				ws1.send(JSON.stringify({ type: 'register', agentId: 'multi-agent-1' }));
				ws2.send(JSON.stringify({ type: 'register', agentId: 'multi-agent-2' }));
				setTimeout(() => {
					if (!resolved) reject(new Error('Registration timeout'));
				}, 3000);
			});

			ws1.send(JSON.stringify({ type: 'nudge', payload: { id: 'n1', from: 'a', to: 'b', type: 'wake', createdAt: Date.now() } }));
			ws2.send(JSON.stringify({ type: 'nudge', payload: { id: 'n2', from: 'a', to: 'b', type: 'wake', createdAt: Date.now() } }));

			await new Promise((r) => setTimeout(r, 50));
			expect(nudgeHandler).toHaveBeenCalledTimes(2);
			ws1.close();
			ws2.close();
		});
	});

	// ─── Status ─────────────────────────────────────────────────────────────────

	describe('status', () => {
		it('should report correct status before and after start', async () => {
			const server = new NudgeServer({ port: 7005, host: '127.0.0.1', heartbeatInterval: 60000 });
			const initialStatus = server.getStatus();
			expect(initialStatus.running).toBe(false);
			expect(initialStatus.connectedAgents).toBe(0);
			expect(initialStatus.totalConnections).toBe(0);
			expect(initialStatus.port).toBe(0);

			await server.start();
			const runningStatus = server.getStatus();
			expect(runningStatus.running).toBe(true);
			expect(runningStatus.port).toBeGreaterThan(0);

			await server.stop();
			const stoppedStatus = server.getStatus();
			expect(stoppedStatus.running).toBe(false);
		});
	});
});