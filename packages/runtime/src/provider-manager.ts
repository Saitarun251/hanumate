/**
 * Provider Manager
 * 
 * Manages provider registration and lookup.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Provider configuration
 */
export interface ProviderConfig {
	/** Provider identifier (e.g., 'openai', 'anthropic') */
	id: string;
	/** Human-readable name */
	name: string;
	/** Base URL for API requests */
	baseURL: string;
	/** Authentication headers */
	authHeaders?: Record<string, string>;
	/** Default model for this provider */
	defaultModel?: string;
	/** Model mapping (short name -> full model ID) */
	modelMapping?: Record<string, string>;
	/** API version (for providers that require it) */
	apiVersion?: string;
}

/**
 * Provider with resolved configuration
 */
export interface Provider {
	/** Provider identifier */
	id: string;
	/** Human-readable name */
	name: string;
	/** Resolved base URL */
	baseURL: string;
	/** Authentication headers (merged with defaults) */
	authHeaders: Record<string, string>;
	/** Default model */
	defaultModel: string;
	/** Model mapping */
	modelMapping: Record<string, string>;
}

// ============================================================================
// Provider Manager
// ============================================================================

/**
 * Provider manager for registration and lookup
 */
export class ProviderManager {
	private providers: Map<string, ProviderConfig> = new Map();
	private defaultProviders: Map<string, ProviderConfig> = new Map();

	constructor() {
		// Register built-in providers
		this.registerBuiltInProviders();
	}

	/**
	 * Register built-in provider configurations
	 */
	private registerBuiltInProviders(): void {
		// OpenAI
		this.defaultProviders.set('openai', {
			id: 'openai',
			name: 'OpenAI',
			baseURL: process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
			authHeaders: {
				'Authorization': `Bearer ${process.env['OPENAI_API_KEY'] || ''}`,
			},
			defaultModel: 'gpt-4o',
			modelMapping: {
				'gpt-4': 'gpt-4',
				'gpt-4-turbo': 'gpt-4-turbo',
				'gpt-4o': 'gpt-4o',
				'gpt-3.5': 'gpt-3.5-turbo',
			},
		});

		// Anthropic
		this.defaultProviders.set('anthropic', {
			id: 'anthropic',
			name: 'Anthropic',
			baseURL: process.env['ANTHROPIC_BASE_URL'] || 'https://api.anthropic.com/v1',
			authHeaders: {
				'x-api-key': process.env['ANTHROPIC_API_KEY'] || '',
				'anthropic-version': '2023-06-01',
			},
			defaultModel: 'claude-sonnet-4-6',
			modelMapping: {
				'claude-3.5': 'claude-3-5-sonnet-20241022',
				'claude-3': 'claude-3-sonnet-20240229',
				'claude': 'claude-3-sonnet-20240229',
			},
		});

		// Google (Gemini)
		this.defaultProviders.set('google', {
			id: 'google',
			name: 'Google',
			baseURL: process.env['GOOGLE_BASE_URL'] || 'https://generativelanguage.googleapis.com/v1beta',
			authHeaders: {
				'Authorization': `Bearer ${process.env['GOOGLE_API_KEY'] || ''}`,
			},
			defaultModel: 'gemini-2.0-flash',
			modelMapping: {
				'gemini-2.0': 'gemini-2.0-flash',
				'gemini-1.5': 'gemini-1.5-pro',
			},
		});

		// Ollama (local models)
		this.defaultProviders.set('ollama', {
			id: 'ollama',
			name: 'Ollama',
			baseURL: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434/v1',
			authHeaders: {},
			defaultModel: 'llama3',
			modelMapping: {
				'llama3': 'llama3',
				'llama2': 'llama2',
				'codellama': 'codellama',
				'mistral': 'mistral',
			},
		});

		// LM Studio
		this.defaultProviders.set('lmstudio', {
			id: 'lmstudio',
			name: 'LM Studio',
			baseURL: process.env['LMSTUDIO_BASE_URL'] || 'http://localhost:1234/v1',
			authHeaders: {},
			defaultModel: 'local-model',
			modelMapping: {},
		});

		// MiniMax
		this.defaultProviders.set('minimax', {
			id: 'minimax',
			name: 'MiniMax',
			baseURL: process.env['MINIMAX_BASE_URL'] || 'https://agent.minimax.io/mavis/api/v1/llm/v1',
			authHeaders: {
				'Authorization': `Bearer ${process.env['MINIMAX_API_KEY'] || ''}`,
			},
			defaultModel: 'MiniMax-M2.7',
			modelMapping: {
				'm2.7': 'MiniMax-M2.7',
				'm2': 'MiniMax-M2.7',
				'highspeed': 'MiniMax-M2.7-highspeed',
			},
		});
	}

	/**
	 * Register a custom provider
	 * @param config Provider configuration
	 */
	registerProvider(config: ProviderConfig): void {
		this.providers.set(config.id, { ...config });
	}

	/**
	 * Get a provider by ID
	 * @param id Provider ID
	 * @returns Provider configuration or null
	 */
	getProvider(id: string): ProviderConfig | null {
		// Check custom providers first
		if (this.providers.has(id)) {
			return this.providers.get(id)!;
		}
		// Then check built-in providers
		if (this.defaultProviders.has(id)) {
			return this.defaultProviders.get(id)!;
		}
		return null;
	}

	/**
	 * List all available provider IDs
	 * @returns Array of provider IDs
	 */
	listProviders(): string[] {
		const custom = Array.from(this.providers.keys());
		const builtIn = Array.from(this.defaultProviders.keys());
		return [...new Set([...custom, ...builtIn])];
	}

	/**
	 * Resolve a provider to a full Provider object with defaults
	 * @param id Provider ID
	 * @param overrides Optional overrides for the provider
	 * @returns Resolved provider or null
	 */
	resolveProvider(id: string, overrides?: Partial<ProviderConfig>): Provider | null {
		const config = this.getProvider(id);
		if (!config) {
			return null;
		}

		return {
			id: config.id,
			name: config.name,
			baseURL: overrides?.baseURL || config.baseURL,
			authHeaders: { ...config.authHeaders, ...overrides?.authHeaders },
			defaultModel: overrides?.defaultModel || config.defaultModel || 'default',
			modelMapping: { ...config.modelMapping, ...overrides?.modelMapping },
		};
	}

	/**
	 * Map a short model name to the full model ID for a provider
	 * @param providerId Provider ID
	 * @param shortModel Short model name (e.g., 'gpt-4')
	 * @returns Full model ID or the short model if no mapping exists
	 */
	mapModel(providerId: string, shortModel: string): string {
		const config = this.getProvider(providerId);
		if (!config || !config.modelMapping) {
			return shortModel;
		}
		return config.modelMapping[shortModel] || shortModel;
	}
}