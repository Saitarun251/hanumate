/**
 * Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	ProviderManager,
	ProviderFallbackChain,
	PROVIDER_ENV_KEYS,
	loadApiKeyFromEnv,
	loadBaseUrlFromEnv,
	type ProviderConfig,
} from '../src/providers.js';

describe('ProviderManager', () => {
	let manager: ProviderManager;

	beforeEach(() => {
		manager = new ProviderManager();
	});

	describe('built-in providers', () => {
		it('should have OpenAI provider registered', () => {
			const provider = manager.getProvider('openai');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('openai');
			expect(provider?.name).toBe('OpenAI');
			expect(provider?.defaultModel).toBe('gpt-4o');
		});

		it('should have Anthropic provider registered', () => {
			const provider = manager.getProvider('anthropic');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('anthropic');
			expect(provider?.name).toBe('Anthropic');
			expect(provider?.defaultModel).toBe('claude-sonnet-4-6');
		});

		it('should have Google provider registered', () => {
			const provider = manager.getProvider('google');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('google');
			expect(provider?.name).toBe('Google');
			expect(provider?.defaultModel).toBe('gemini-2.0-flash');
		});

		it('should have Ollama provider registered', () => {
			const provider = manager.getProvider('ollama');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('ollama');
			expect(provider?.name).toBe('Ollama');
			expect(provider?.defaultModel).toBe('llama3');
		});

		it('should have LM Studio provider registered', () => {
			const provider = manager.getProvider('lmstudio');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('lmstudio');
			expect(provider?.name).toBe('LM Studio');
			expect(provider?.defaultModel).toBe('local-model');
		});

		it('should list all built-in providers', () => {
			const providers = manager.listProviders();
			expect(providers).toContain('openai');
			expect(providers).toContain('anthropic');
			expect(providers).toContain('google');
			expect(providers).toContain('ollama');
			expect(providers).toContain('lmstudio');
		});
	});

	describe('custom provider registration', () => {
		it('should register a custom provider', () => {
			const customProvider: ProviderConfig = {
				id: 'custom',
				name: 'Custom Provider',
				baseURL: 'https://custom.api.com/v1',
				defaultModel: 'custom-model',
			};

			manager.registerProvider(customProvider);
			const provider = manager.getProvider('custom');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('custom');
			expect(provider?.name).toBe('Custom Provider');
		});

		it('should override built-in provider with custom', () => {
			const customProvider: ProviderConfig = {
				id: 'openai',
				name: 'Custom OpenAI',
				baseURL: 'https://custom.openai.com/v1',
				defaultModel: 'gpt-5',
			};

			manager.registerProvider(customProvider);
			const provider = manager.getProvider('openai');
			expect(provider?.name).toBe('Custom OpenAI');
			expect(provider?.defaultModel).toBe('gpt-5');
		});

		it('should list custom providers', () => {
			manager.registerProvider({
				id: 'custom1',
				name: 'Custom 1',
				baseURL: 'https://custom1.com',
			});
			manager.registerProvider({
				id: 'custom2',
				name: 'Custom 2',
				baseURL: 'https://custom2.com',
			});

			const providers = manager.listProviders();
			expect(providers).toContain('custom1');
			expect(providers).toContain('custom2');
		});
	});

	describe('resolveProvider', () => {
		it('should resolve provider with defaults', () => {
			const provider = manager.resolveProvider('openai');
			expect(provider).not.toBeNull();
			expect(provider?.id).toBe('openai');
			expect(provider?.name).toBe('OpenAI');
			expect(provider?.baseURL).toContain('api.openai.com');
		});

		it('should allow overrides on resolve', () => {
			const provider = manager.resolveProvider('openai', {
				baseURL: 'https://proxy.example.com/openai',
				defaultModel: 'gpt-4',
			});
			expect(provider?.baseURL).toBe('https://proxy.example.com/openai');
			expect(provider?.defaultModel).toBe('gpt-4');
		});

		it('should return null for unknown provider', () => {
			const provider = manager.resolveProvider('unknown');
			expect(provider).toBeNull();
		});
	});

	describe('model mapping', () => {
		it('should map short model names for OpenAI', () => {
			const mapped = manager.mapModel('openai', 'gpt-4');
			expect(mapped).toBe('gpt-4');
		});

		it('should map Claude short names', () => {
			const mapped = manager.mapModel('anthropic', 'claude-3.5');
			expect(mapped).toBe('claude-3-5-sonnet-20241022');
		});

		it('should return original if no mapping exists', () => {
			const mapped = manager.mapModel('openai', 'unknown-model');
			expect(mapped).toBe('unknown-model');
		});

		it('should return original for unknown provider', () => {
			const mapped = manager.mapModel('unknown', 'some-model');
			expect(mapped).toBe('some-model');
		});
	});
});

describe('ProviderFallbackChain', () => {
	let manager: ProviderManager;

	beforeEach(() => {
		manager = new ProviderManager();
	});

	describe('chain creation', () => {
		it('should create chain from provider IDs', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'anthropic']);
			const providers = chain.getAll();
			expect(providers).toHaveLength(2);
			expect(providers[0].id).toBe('openai');
			expect(providers[1].id).toBe('anthropic');
		});

		it('should handle empty provider list', () => {
			const chain = new ProviderFallbackChain(manager, []);
			const providers = chain.getAll();
			expect(providers).toHaveLength(0);
		});

		it('should skip invalid provider IDs', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'invalid', 'anthropic']);
			const providers = chain.getAll();
			expect(providers).toHaveLength(2);
		});
	});

	describe('getCurrent', () => {
		it('should return primary provider', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'anthropic']);
			const current = chain.getCurrent();
			expect(current?.id).toBe('openai');
		});

		it('should return null for empty chain', () => {
			const chain = new ProviderFallbackChain(manager, []);
			const current = chain.getCurrent();
			expect(current).toBeNull();
		});
	});

	describe('fallback', () => {
		it('should fallback to next provider', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'anthropic']);
			const next = chain.fallback();
			expect(next?.id).toBe('anthropic');
			expect(chain.getCurrent()?.id).toBe('anthropic');
		});

		it('should return null when no more providers', () => {
			const chain = new ProviderFallbackChain(manager, ['openai']);
			const next = chain.fallback();
			expect(next).toBeNull();
		});

		it('should return null for empty chain', () => {
			const chain = new ProviderFallbackChain(manager, []);
			const next = chain.fallback();
			expect(next).toBeNull();
		});
	});

	describe('reset', () => {
		it('should reset to primary provider', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'anthropic']);
			chain.fallback();
			chain.reset();
			expect(chain.getCurrent()?.id).toBe('openai');
		});
	});

	describe('hasMore', () => {
		it('should return true when more providers available', () => {
			const chain = new ProviderFallbackChain(manager, ['openai', 'anthropic']);
			expect(chain.hasMore()).toBe(true);
		});

		it('should return false when at last provider', () => {
			const chain = new ProviderFallbackChain(manager, ['openai']);
			expect(chain.hasMore()).toBe(false);
		});

		it('should return false for empty chain', () => {
			const chain = new ProviderFallbackChain(manager, []);
			expect(chain.hasMore()).toBe(false);
		});
	});

	describe('overrides', () => {
		it('should apply overrides to providers', () => {
			const chain = new ProviderFallbackChain(manager, ['openai'], {
				openai: { baseURL: 'https://custom.url' },
			});
			const provider = chain.getCurrent();
			expect(provider?.baseURL).toBe('https://custom.url');
		});

		it('should apply different overrides to different providers', () => {
			const chain = new ProviderFallbackChain(
				manager,
				['openai', 'anthropic'],
				{
					openai: { baseURL: 'https://openai.proxy' },
					anthropic: { baseURL: 'https://anthropic.proxy' },
				}
			);
			const providers = chain.getAll();
			expect(providers[0].baseURL).toBe('https://openai.proxy');
			expect(providers[1].baseURL).toBe('https://anthropic.proxy');
		});
	});
});

describe('Environment configuration', () => {
	describe('PROVIDER_ENV_KEYS', () => {
		it('should have OpenAI keys', () => {
			expect(PROVIDER_ENV_KEYS.OPENAI_API_KEY).toBe('OPENAI_API_KEY');
			expect(PROVIDER_ENV_KEYS.OPENAI_BASE_URL).toBe('OPENAI_BASE_URL');
		});

		it('should have Anthropic keys', () => {
			expect(PROVIDER_ENV_KEYS.ANTHROPIC_API_KEY).toBe('ANTHROPIC_API_KEY');
			expect(PROVIDER_ENV_KEYS.ANTHROPIC_BASE_URL).toBe('ANTHROPIC_BASE_URL');
		});

		it('should have Google keys', () => {
			expect(PROVIDER_ENV_KEYS.GOOGLE_API_KEY).toBe('GOOGLE_API_KEY');
			expect(PROVIDER_ENV_KEYS.GOOGLE_BASE_URL).toBe('GOOGLE_BASE_URL');
		});

		it('should have Ollama keys', () => {
			expect(PROVIDER_ENV_KEYS.OLLAMA_BASE_URL).toBe('OLLAMA_BASE_URL');
		});

		it('should have LM Studio keys', () => {
			expect(PROVIDER_ENV_KEYS.LMSTUDIO_BASE_URL).toBe('LMSTUDIO_BASE_URL');
		});
	});

	describe('loadApiKeyFromEnv', () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it('should load OpenAI API key from env', () => {
			process.env['OPENAI_API_KEY'] = 'sk-test-key';
			const key = loadApiKeyFromEnv('openai');
			expect(key).toBe('sk-test-key');
		});

		it('should load Anthropic API key from env', () => {
			process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
			const key = loadApiKeyFromEnv('anthropic');
			expect(key).toBe('sk-ant-test');
		});

		it('should load Google API key from env', () => {
			process.env['GOOGLE_API_KEY'] = 'google-test-key';
			const key = loadApiKeyFromEnv('google');
			expect(key).toBe('google-test-key');
		});

		it('should return null when key not set', () => {
			delete process.env['OPENAI_API_KEY'];
			const key = loadApiKeyFromEnv('openai');
			expect(key).toBeNull();
		});

		it('should fall back to custom key for unknown providers', () => {
			process.env['CUSTOM_PROVIDER_KEY'] = 'custom-key';
			const key = loadApiKeyFromEnv('unknown');
			expect(key).toBe('custom-key');
		});
	});

	describe('loadBaseUrlFromEnv', () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it('should load base URL from env', () => {
			process.env['OLLAMA_BASE_URL'] = 'http://localhost:11434/v1';
			const url = loadBaseUrlFromEnv('ollama');
			expect(url).toBe('http://localhost:11434/v1');
		});

		it('should return null when URL not set', () => {
			delete process.env['OLLAMA_BASE_URL'];
			const url = loadBaseUrlFromEnv('ollama');
			expect(url).toBeNull();
		});
	});
});

describe('Custom endpoint override', () => {
	let manager: ProviderManager;

	beforeEach(() => {
		manager = new ProviderManager();
	});

	it('should override baseURL for proxy', () => {
		const provider = manager.resolveProvider('openai', {
			baseURL: 'https://my-proxy.com/openai/v1',
		});
		expect(provider?.baseURL).toBe('https://my-proxy.com/openai/v1');
	});

	it('should preserve original for non-overridden fields', () => {
		const provider = manager.resolveProvider('openai', {
			baseURL: 'https://proxy.com',
		});
		expect(provider?.name).toBe('OpenAI');
		expect(provider?.defaultModel).toBe('gpt-4o');
	});

	it('should allow custom auth headers', () => {
		const provider = manager.resolveProvider('openai', {
			authHeaders: {
				'Authorization': 'Bearer custom-key',
				'X-Custom-Header': 'value',
			},
		});
		expect(provider?.authHeaders['Authorization']).toBe('Bearer custom-key');
		expect(provider?.authHeaders['X-Custom-Header']).toBe('value');
	});
});