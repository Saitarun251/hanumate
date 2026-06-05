/**
 * Subagent / Orchestration System Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../src/agents.js';
import { Dispatcher, dispatch, dispatchAsync, dispatchSequential } from '../src/dispatch.js';
import { SharedContext, ResultCapture, createSharedContext, createResultCapture } from '../src/shared-context.js';

// Mock the pi-agent-core module
vi.mock('@earendil-works/pi-agent-core', () => ({
	default: {
		createAgentLoop: vi.fn(() => ({
			prompt: vi.fn().mockResolvedValue({ message: 'mock response' }),
		})),
	},
}));

describe('AgentRegistry', () => {
	let registry: AgentRegistry;

	beforeEach(() => {
		registry = new AgentRegistry();
	});

	describe('register()', () => {
		it('should register an agent with id and config', () => {
			const agent = registry.register('test-agent', { model: 'test-model' });
			expect(agent).toBeDefined();
			expect(registry.has('test-agent')).toBe(true);
		});

		it('should throw error when registering duplicate id', () => {
			registry.register('dup-agent', { model: 'test' });
			expect(() => registry.register('dup-agent', { model: 'test2' })).toThrow(/already registered/);
		});

		it('should register with name and tags', () => {
			const agent = registry.register('tagged-agent', { model: 'test' }, 'My Agent', ['coder', 'reviewer']);
			expect(agent).toBeDefined();
			expect(registry.findByTag('coder')).toContain('tagged-agent');
			expect(registry.findByTag('reviewer')).toContain('tagged-agent');
		});
	});

	describe('get()', () => {
		it('should return agent by id', () => {
			registry.register('get-test', { model: 'test' });
			const agent = registry.get('get-test');
			expect(agent).toBeDefined();
		});

		it('should return undefined for non-existent agent', () => {
			expect(registry.get('non-existent')).toBeUndefined();
		});
	});

	describe('list()', () => {
		it('should list all registered agent ids', () => {
			registry.register('agent-1', { model: 'test' });
			registry.register('agent-2', { model: 'test' });
			const ids = registry.list();
			expect(ids).toHaveLength(2);
			expect(ids).toContain('agent-1');
			expect(ids).toContain('agent-2');
		});
	});

	describe('has()', () => {
		it('should return true for registered agent', () => {
			registry.register('has-test', { model: 'test' });
			expect(registry.has('has-test')).toBe(true);
		});

		it('should return false for non-registered agent', () => {
			expect(registry.has('not-registered')).toBe(false);
		});
	});

	describe('unregister()', () => {
		it('should remove agent from registry', () => {
			registry.register('unreg-test', { model: 'test' });
			const removed = registry.unregister('unreg-test');
			expect(removed).toBeDefined();
			expect(registry.has('unreg-test')).toBe(false);
		});

		it('should return undefined for non-existent agent', () => {
			expect(registry.unregister('non-existent')).toBeUndefined();
		});
	});

	describe('clear()', () => {
		it('should remove all agents', () => {
			registry.register('clear-1', { model: 'test' });
			registry.register('clear-2', { model: 'test' });
			registry.clear();
			expect(registry.list()).toHaveLength(0);
		});
	});

	describe('size', () => {
		it('should return correct count', () => {
			expect(registry.size).toBe(0);
			registry.register('size-1', { model: 'test' });
			expect(registry.size).toBe(1);
			registry.register('size-2', { model: 'test' });
			expect(registry.size).toBe(2);
		});
	});
});

describe('SharedContext', () => {
	let context: SharedContext;

	beforeEach(() => {
		context = createSharedContext();
	});

	describe('set() and get()', () => {
		it('should store and retrieve values', () => {
			context.set('key1', 'value1');
			expect(context.get('key1')).toBe('value1');
		});

		it('should return undefined for non-existent key', () => {
			expect(context.get('non-existent')).toBeUndefined();
		});
	});

	describe('TTL', () => {
		it('should expire entries after TTL', async () => {
			context.set('expiring', 'value', undefined, { ttl: 10 });
			expect(context.get('expiring')).toBe('value');
			await new Promise((r) => setTimeout(r, 20));
			expect(context.get('expiring')).toBeUndefined();
		});
	});

	describe('has() and delete()', () => {
		it('should check existence and delete entries', () => {
			context.set('delete-me', 'value');
			expect(context.has('delete-me')).toBe(true);
			context.delete('delete-me');
			expect(context.has('delete-me')).toBe(false);
		});

		it('should throw on immutable entries', () => {
			context.set('immutable', 'value', undefined, { immutable: true });
			expect(() => context.delete('immutable')).toThrow(/immutable/);
		});
	});

	describe('toObject()', () => {
		it('should return all entries as object', () => {
			context.set('a', 1);
			context.set('b', 2);
			const obj = context.toObject();
			expect(obj).toEqual({ a: 1, b: 2 });
		});
	});

	describe('parent context', () => {
		it('should fall back to parent context', () => {
			const parent = createSharedContext();
			parent.set('parent-key', 'parent-value');
			const child = new SharedContext(parent);
			expect(child.get('parent-key')).toBe('parent-value');
		});
	});

	describe('fork()', () => {
		it('should create independent copy', () => {
			context.set('shared', 'value');
			const forked = context.fork();
			forked.set('fork-only', 'fork-value');
			expect(context.has('fork-only')).toBe(false);
			expect(forked.get('shared')).toBe('value');
		});
	});

	describe('merge()', () => {
		it('should merge another context', () => {
			context.set('original', 'val1');
			const other = createSharedContext();
			other.set('other', 'val2');
			context.merge(other);
			expect(context.get('other')).toBe('val2');
		});
	});
});

describe('ResultCapture', () => {
	let capture: ResultCapture;

	beforeEach(() => {
		capture = createResultCapture();
	});

	describe('capture()', () => {
		it('should capture a result', () => {
			const result = capture.capture({
				agentId: 'agent-1',
				startTime: Date.now() - 100,
				endTime: Date.now(),
				duration: 100,
				success: true,
				data: { output: 'test' },
			});
			expect(result.agentId).toBe('agent-1');
			expect(capture.size).toBe(1);
		});

		it('should capture failed results', () => {
			capture.capture({
				agentId: 'agent-1',
				startTime: Date.now(),
				endTime: Date.now(),
				duration: 50,
				success: false,
				error: 'Test error',
			});
			expect(capture.getFailed()).toHaveLength(1);
		});
	});

	describe('getResults()', () => {
		it('should return all results', () => {
			capture.capture({ agentId: 'a', startTime: 1, endTime: 2, duration: 1, success: true });
			capture.capture({ agentId: 'b', startTime: 3, endTime: 4, duration: 1, success: true });
			expect(capture.getResults()).toHaveLength(2);
		});
	});

	describe('aggregateData()', () => {
		it('should aggregate successful data', () => {
			capture.capture({ agentId: 'a', startTime: 1, endTime: 2, duration: 1, success: true, data: 'data1' });
			capture.capture({ agentId: 'b', startTime: 3, endTime: 4, duration: 1, success: true, data: 'data2' });
			capture.capture({ agentId: 'c', startTime: 5, endTime: 6, duration: 1, success: false, error: 'fail' });
			const data = capture.aggregateData();
			expect(data).toEqual(['data1', 'data2']);
		});
	});

	describe('getTotalDuration()', () => {
		it('should sum all durations', () => {
			capture.capture({ agentId: 'a', startTime: 1, endTime: 101, duration: 100, success: true });
			capture.capture({ agentId: 'b', startTime: 101, endTime: 201, duration: 100, success: true });
			expect(capture.getTotalDuration()).toBe(200);
		});
	});
});

describe('Dispatcher', () => {
	let registry: AgentRegistry;
	let dispatcher: Dispatcher;

	beforeEach(() => {
		registry = new AgentRegistry();
		registry.register('agent-1', { model: 'test' });
		registry.register('agent-2', { model: 'test' });
		dispatcher = new Dispatcher(registry);
	});

	describe('dispatch()', () => {
		it('should dispatch to registered agent by id', async () => {
			const result = await dispatcher.dispatch({ target: 'agent-1', task: 'test task' });
			expect(result.success).toBe(true);
			expect(result.target).toBe('agent-1');
		});

		it('should return error for non-existent agent', async () => {
			const result = await dispatcher.dispatch({ target: 'non-existent', task: 'test' });
			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});
	});

	describe('dispatchAsync()', () => {
		it('should dispatch to multiple agents in parallel', async () => {
			const result = await dispatcher.dispatchAsync(['agent-1', 'agent-2'], 'parallel task');
			expect(result.results).toHaveLength(2);
			expect(result.success).toBe(true);
		});
	});

	describe('dispatchSequential()', () => {
		it('should dispatch to multiple agents in sequence', async () => {
			const result = await dispatcher.dispatchSequential(['agent-1', 'agent-2'], 'sequential task');
			expect(result.results).toHaveLength(2);
			expect(result.success).toBe(true);
		});
	});
});

describe('Standalone dispatch functions', () => {
	let registry: AgentRegistry;

	beforeEach(() => {
		registry = new AgentRegistry();
		registry.register('standalone-agent', { model: 'test' });
	});

	it('should work as standalone function', async () => {
		const result = await dispatch(registry, { target: 'standalone-agent', task: 'test' });
		expect(result.success).toBe(true);
	});

	it('should work as standalone async function', async () => {
		const result = await dispatchAsync(registry, ['standalone-agent'], 'async test');
		expect(result.success).toBe(true);
	});

	it('should work as standalone sequential function', async () => {
		const result = await dispatchSequential(registry, ['standalone-agent'], 'seq test');
		expect(result.success).toBe(true);
	});
});