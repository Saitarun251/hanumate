/**
 * Provider Abstraction Layer
 * 
 * Provides support for custom LLM providers and API gateways.
 * Supports OpenAI, Anthropic, Google, Ollama, and LM Studio out of the box.
 * Also supports custom provider registration and fallback chains.
 */

import { ProviderManager, type ProviderConfig, type Provider } from './provider-manager.js';

// Re-export types
export type { ProviderConfig, Provider } from './provider-manager.js';

// ============================================================================
// Provider Fallback Chain
// ============================================================================

/**
 * Provider fallback chain for high availability
 */
export class ProviderFallbackChain {
	private providers: Provider[];
	private currentIndex: number = 0;

	/**
	 * Create a fallback chain from provider configurations
	 * @param manager Provider manager
	 * @param providerIds Ordered list of provider IDs (primary first)
	 * @param overrides Optional overrides for each provider
	 */
	constructor(
		manager: ProviderManager,
		providerIds: string[],
		overrides?: Record<string, Partial<ProviderConfig>>
	) {
		this.providers = [];
		
		for (const id of providerIds) {
			const resolved = manager.resolveProvider(id, overrides?.[id]);
			if (resolved) {
				this.providers.push(resolved);
			}
		}
	}

	/**
	 * Get the current (primary) provider
	 * @returns Current provider or null if none available
	 */
	getCurrent(): Provider | null {
		if (this.currentIndex >= this.providers.length) {
			return null;
		}
		return this.providers[this.currentIndex];
	}

	/**
	 * Fallback to the next provider in the chain
	 * @returns Next provider or null if no more providers
	 */
	fallback(): Provider | null {
		if (this.currentIndex < this.providers.length - 1) {
			this.currentIndex++;
			return this.providers[this.currentIndex];
		}
		return null;
	}

	/**
	 * Reset to the primary provider
	 */
	reset(): void {
		this.currentIndex = 0;
	}

	/**
	 * Check if there are more providers to try
	 * @returns True if more providers available
	 */
	hasMore(): boolean {
		return this.currentIndex < this.providers.length - 1;
	}

	/**
	 * Get all providers in the chain
	 * @returns Array of providers
	 */
	getAll(): Provider[] {
		return [...this.providers];
	}

	/**
	 * Get the current provider index
	 * @returns Current index
	 */
	getCurrentIndex(): number {
		return this.currentIndex;
	}
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Environment variable keys for provider configuration
 */
export const PROVIDER_ENV_KEYS = {
	// OpenAI
	OPENAI_API_KEY: 'OPENAI_API_KEY',
	OPENAI_BASE_URL: 'OPENAI_BASE_URL',
	
	// Anthropic
	ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
	ANTHROPIC_BASE_URL: 'ANTHROPIC_BASE_URL',
	
	// Google
	GOOGLE_API_KEY: 'GOOGLE_API_KEY',
	GOOGLE_BASE_URL: 'GOOGLE_BASE_URL',
	
	// Ollama
	OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
	
	// LM Studio
	LMSTUDIO_BASE_URL: 'LMSTUDIO_BASE_URL',
	
	// Generic
	CUSTOM_PROVIDER_URL: 'CUSTOM_PROVIDER_URL',
	CUSTOM_PROVIDER_KEY: 'CUSTOM_PROVIDER_KEY',
} as const;

/**
 * Load API key from environment for a specific provider
 * @param providerId Provider ID
 * @returns API key or null
 */
export function loadApiKeyFromEnv(providerId: string): string | null {
	switch (providerId) {
		case 'openai':
			return process.env[PROVIDER_ENV_KEYS.OPENAI_API_KEY] || null;
		case 'anthropic':
			return process.env[PROVIDER_ENV_KEYS.ANTHROPIC_API_KEY] || null;
		case 'google':
			return process.env[PROVIDER_ENV_KEYS.GOOGLE_API_KEY] || null;
		default:
			// Check generic keys
			return process.env[PROVIDER_ENV_KEYS.CUSTOM_PROVIDER_KEY] || null;
	}
}

/**
 * Load base URL from environment for a specific provider
 * @param providerId Provider ID
 * @returns Base URL or null
 */
export function loadBaseUrlFromEnv(providerId: string): string | null {
	const envKey = `${providerId.toUpperCase()}_BASE_URL`;
	return process.env[envKey] || null;
}

// ============================================================================
// Default Export
// ============================================================================

export { ProviderManager } from './provider-manager.js';