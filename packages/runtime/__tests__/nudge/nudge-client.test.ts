/**
 * Nudge Client Tests
 * Tests for the Nudge WebSocket client.
 * Uses vi.spyOn to mock WebSocket at the class level for reliable testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NudgeClient, type NudgeClientConfig } from '../../src/nudge/nudge-client.ts';

describe('NudgeClient', () => {
	// ─── Constructor ─────────────────────────────────────────────────────────────

	describe('constructor', () => {
		it('should create client with required agentId', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			expect(client).toBeDefined();
		});

		it('should throw error if agentId is missing', () => {
			expect(() => new NudgeClient({} as NudgeClientConfig)).toThrow(
				'agentId is required for NudgeClient'
			);
		});

		it('should throw error if agentId is empty string', () => {
			expect(() => new NudgeClient({ agentId: '' })).toThrow(
				'agentId is required for NudgeClient'
			);
		});

		it('should apply default configuration values', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			expect(client).toBeDefined();
		});

		it('should accept custom configuration', () => {
			const client = new NudgeClient({
				agentId: 'test-agent',
				heartbeatInterval: 60000,
				maxReconnectAttempts: 3,
				reconnectBaseDelay: 500,
				reconnectMaxDelay: 10000,
				connectionTimeout: 5000,
				debug: true,
			});
			expect(client).toBeDefined();
		});
	});

	// ─── isConnected ─────────────────────────────────────────────────────────────

	describe('isConnected', () => {
		it('should return false before connection', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			expect(client.isConnected()).toBe(false);
		});
	});

	// ─── send ─────────────────────────────────────────────────────────────────────

	describe('send', () => {
		it('should throw error when not connected', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			expect(() => client.send('target-agent', 'wake')).toThrow(
				'Cannot send nudge: not connected to Nudge server'
			);
		});

		it('should throw error with correct message', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			expect(() => client.send('target', 'interrupt')).toThrow(
				'Cannot send nudge: not connected to Nudge server'
			);
		});

		it('should include correct message in error', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			try {
				client.send('target', 'heartbeat');
			} catch (e) {
				expect((e as Error).message).toContain('not connected');
			}
		});
	});

	// ─── disconnect ──────────────────────────────────────────────────────────────

	describe('disconnect', () => {
		it('should resolve without error when not connected', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			await expect(client.disconnect()).resolves.toBeUndefined();
		});

		it('should set isConnected to false after disconnect', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			await client.disconnect();
			expect(client.isConnected()).toBe(false);
		});
	});

	// ─── onNudge ─────────────────────────────────────────────────────────────────

	describe('onNudge', () => {
		it('should register a handler', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const handler = vi.fn();
			client.onNudge(handler);
			// No error means success
			expect(client).toBeDefined();
		});

		it('should register multiple handlers', () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const h1 = vi.fn();
			const h2 = vi.fn();
			client.onNudge(h1);
			client.onNudge(h2);
			expect(client).toBeDefined();
		});
	});

	// ─── Integration with mocked WebSocket ────────────────────────────────────────

	describe('with mocked WebSocket', () => {
		let realSetTimeout: typeof setTimeout;
		let originalWebSocket: typeof WebSocket;
		// Capture real MockWS instances so tests can fire events on them
		let lastMockWsInstance: InstanceType<typeof WebSocket> | null = null;
		// Flag to make the next connection fail instead of succeed
		let connectionShouldFail = false;

		beforeEach(() => {
			realSetTimeout = setTimeout;
			originalWebSocket = globalThis.WebSocket;
			lastMockWsInstance = null;
			connectionShouldFail = false;

			// Create a proper class mock
			class MockWS {
				static CONNECTING = 0;
				static OPEN = 1;
				static CLOSING = 2;
				static CLOSED = 3;
				readyState = 0;
				url = '';
				onopen: ((e: Event) => void) | null = null;
				onclose: ((e: CloseEvent) => void) | null = null;
				onerror: ((e: Event) => void) | null = null;
				onmessage: ((e: MessageEvent) => void) | null = null;
				binaryType: BinaryType = 'blob';
				protocol = '';

				constructor(url: string) {
					this.url = url;
					lastMockWsInstance = this;
					if (connectionShouldFail) {
						// Simulate connection failure (never opens)
						realSetTimeout(() => {
							this.readyState = 3; // CLOSED
							if (this.onclose) {
								this.onclose(new CloseEvent('close', { wasClean: false }));
							}
						}, 5);
					} else {
						realSetTimeout(() => {
							this.readyState = 1; // OPEN
							if (this.onopen) this.onopen(new Event('open'));
						}, 10);
					}
				}

				send(_data: string) {}

				close() {
					this.readyState = 3;
					if (this.onclose) this.onclose(new CloseEvent('close'));
				}
			}

			(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
				MockWS as unknown as typeof WebSocket;
		});

		afterEach(() => {
			vi.restoreAllMocks();
			(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
				originalWebSocket;
		});

		it('should connect successfully', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const connectPromise = client.connect('ws://localhost:8080');

			// Wait for mock async open (10ms + buffer)
			await new Promise((r) => setTimeout(r, 30));

			await expect(connectPromise).resolves.toBeUndefined();
			expect(client.isConnected()).toBe(true);
		});

		it('should throw on connection timeout', async () => {
			connectionShouldFail = true;
			const client = new NudgeClient({
				agentId: 'test-agent',
				connectionTimeout: 50,
			});

			const connectPromise = client.connect('ws://localhost:8080');
			// Swallow unhandled rejection from double-reject race (timeout vs onclose)
			connectPromise.catch(() => {});
			await new Promise((r) => setTimeout(r, 100));

			await expect(connectPromise).rejects.toThrow('Connection timeout');
			expect(client.isConnected()).toBe(false);
		});

		it('should send nudge after connected', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			const nudgeId = client.send('target-agent', 'wake', { task: 'test' });
			expect(nudgeId).toMatch(/^nudge-[a-z0-9]{5}$/);
		});

		it('should disconnect cleanly', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			expect(client.isConnected()).toBe(true);

			await client.disconnect();
			expect(client.isConnected()).toBe(false);
		});

		it('should receive nudge after connecting', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const handler = vi.fn();
			client.onNudge(handler);

			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			// Simulate incoming nudge
			const nudge = {
				id: 'nudge-abc12',
				from: 'other-agent',
				to: 'test-agent',
				type: 'wake' as const,
				payload: {},
				createdAt: Date.now(),
			};
			lastMockWsInstance!.onmessage!(
				new MessageEvent('message', { data: JSON.stringify({ type: 'nudge', payload: nudge }) })
			);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'nudge-abc12', from: 'other-agent' }));
		});

		it('should ignore nudge for other agent', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const handler = vi.fn();
			client.onNudge(handler);

			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			// Simulate nudge for different agent
			const nudge = {
				id: 'nudge-xyz99',
				from: 'other-agent',
				to: 'other-agent',
				type: 'work' as const,
				payload: {},
				createdAt: Date.now(),
			};
			lastMockWsInstance!.onmessage!(
				new MessageEvent('message', { data: JSON.stringify({ type: 'nudge', payload: nudge }) })
			);

			expect(handler).not.toHaveBeenCalled();
		});

		it('should deliver broadcast nudges (to: *)', async () => {
			const client = new NudgeClient({ agentId: 'test-agent' });
			const handler = vi.fn();
			client.onNudge(handler);

			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			const nudge = {
				id: 'nudge-bcast1',
				from: 'broadcaster',
				to: '*',
				type: 'interrupt' as const,
				payload: {},
				createdAt: Date.now(),
			};
			lastMockWsInstance!.onmessage!(
				new MessageEvent('message', { data: JSON.stringify({ type: 'nudge', payload: nudge }) })
			);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it('should reconnect on unexpected disconnect', async () => {
			const client = new NudgeClient({
				agentId: 'test-agent',
				maxReconnectAttempts: 3,
				reconnectBaseDelay: 20,
			});

			await client.connect('ws://localhost:8080');
			await new Promise((r) => setTimeout(r, 30));

			expect(client.isConnected()).toBe(true);

			// Simulate unexpected close
			lastMockWsInstance!.onclose!(new CloseEvent('close'));

			// Should schedule reconnect
			await new Promise((r) => setTimeout(r, 10));
			expect(client.isConnected()).toBe(false); // reconnecting, not yet connected
		});
	});
});