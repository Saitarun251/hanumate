/**
 * Provider Configuration System
 * 
 * Provides centralized provider configuration management supporting:
 * - Built-in providers (OpenAI, Anthropic, Google, Ollama, LM Studio)
 * - Custom provider registration
 * - Enterprise API gateways and proxies
 * - Authentication header customization
 */

import { ProviderManager, type ProviderConfig } from './provider-manager.js';

// ============================================================================
// Enterprise Provider Configuration
// ============================================================================

/**
 * Enterprise API gateway configuration
 */
export interface GatewayConfig {
	/** Gateway base URL (e.g., 'https://gateway.company.com') */
	baseURL: string;
	/** Custom headers added by gateway */
	headers?: Record<string, string>;
	/** Path prefix for routing (e.g., '/api/v1/models') */
	pathPrefix?: string;
	/** TLS configuration */
	tls?: {
		/** Path to CA certificate */
		ca?: string;
		/** Path to client certificate */
		cert?: string;
		/** Path to client key */
		key?: string;
		/** Skip TLS verification (not recommended for production) */
		skipVerify?: boolean;
	};
}

/**
 * Result of configuring a provider with gateway settings
 */
export interface ConfiguredProvider {
	/** The provider ID */
	id: string;
	/** Resolved configuration */
	config: ProviderConfig;
	/** Whether a gateway is being used */
	gateway?: GatewayConfig;
	/** Original base URL before gateway rewrite */
	originalBaseURL?: string;
}

// ============================================================================
// Provider Configuration Store
// ============================================================================

/**
 * Internal store for provider configurations
 */
const providerConfigs = new Map<string, ProviderConfig>();

/**
 * Internal store for gateway configurations
 */
const gatewayConfigs = new Map<string, GatewayConfig>();

/**
 * Configure a provider with ID and config
 * @param id Provider identifier
 * @param config Provider configuration
 */
export function configureProvider(id: string, config: ProviderConfig): void {
	providerConfigs.set(id, {
		...config,
		id, // Ensure ID is set
	});
}

/**
 * Get a configured provider by ID
 * @param id Provider identifier
 * @returns Provider configuration or null
 */
export function getConfiguredProvider(id: string): ProviderConfig | null {
	return providerConfigs.get(id) ?? null;
}

/**
 * List all configured provider IDs
 * @returns Array of configured provider IDs
 */
export function listConfiguredProviders(): string[] {
	return Array.from(providerConfigs.keys());
}

/**
 * Remove a provider configuration
 * @param id Provider identifier
 */
export function removeProviderConfig(id: string): boolean {
	return providerConfigs.delete(id);
}

// ============================================================================
// Gateway Configuration
// ============================================================================

/**
 * Configure an API gateway for a provider
 * @param providerId Provider ID
 * @param gateway Gateway configuration
 */
export function configureGateway(providerId: string, gateway: GatewayConfig): void {
	gatewayConfigs.set(providerId, gateway);
}

/**
 * Get gateway configuration for a provider
 * @param providerId Provider ID
 * @returns Gateway configuration or null
 */
export function getGatewayConfig(providerId: string): GatewayConfig | null {
	return gatewayConfigs.get(providerId) ?? null;
}

/**
 * Remove gateway configuration for a provider
 * @param providerId Provider ID
 */
export function removeGatewayConfig(providerId: string): boolean {
	return gatewayConfigs.delete(providerId);
}

// ============================================================================
// Provider Resolution with Gateway Support
// ============================================================================

/**
 * Resolve provider with gateway rewrites applied
 * @param manager Provider manager
 * @param providerId Provider ID
 * @param customConfig Optional custom config
 * @returns Configured provider with gateway info
 */
export function resolveProviderWithGateway(
	manager: ProviderManager,
	providerId: string,
	customConfig?: Partial<ProviderConfig>
): ConfiguredProvider | null {
	const baseConfig = manager.getProvider(providerId) ?? getConfiguredProvider(providerId);
	
	if (!baseConfig) {
		return null;
	}

	const gateway = getGatewayConfig(providerId);
	const mergedConfig = { ...baseConfig, ...customConfig };

	// Apply gateway rewrites
	let finalBaseURL = mergedConfig.baseURL;
	let originalBaseURL: string | undefined;

	if (gateway) {
		originalBaseURL = mergedConfig.baseURL;
		
		// Rewrite base URL to gateway
		if (gateway.pathPrefix) {
			// Extract the path from the original URL and prepend gateway path
			try {
				const url = new URL(mergedConfig.baseURL);
				finalBaseURL = `${gateway.baseURL}${gateway.pathPrefix}${url.pathname}`;
			} catch {
				finalBaseURL = `${gateway.baseURL}${gateway.pathPrefix}`;
			}
		} else {
			finalBaseURL = gateway.baseURL;
		}
	}

	const resolvedConfig: ProviderConfig = {
		...mergedConfig,
		baseURL: finalBaseURL,
		// Merge gateway headers with auth headers
		authHeaders: gateway?.headers
			? { ...gateway.headers, ...mergedConfig.authHeaders }
			: mergedConfig.authHeaders,
	};

	return {
		id: providerId,
		config: resolvedConfig,
		gateway: gateway ?? undefined,
		originalBaseURL,
	};
}

// ============================================================================
// Enterprise Provider Registration
// ============================================================================

/**
 * Register an enterprise provider with gateway
 * @param providerId Provider identifier
 * @param config Provider configuration
 * @param gateway Optional gateway configuration
 */
export function registerEnterpriseProvider(
	providerId: string,
	config: Omit<ProviderConfig, 'id'>,
	gateway?: GatewayConfig
): void {
	configureProvider(providerId, { ...config, id: providerId });
	
	if (gateway) {
		configureGateway(providerId, gateway);
	}
}

/**
 * Enterprise preset configurations
 */
export const ENTERPRISE_PRESETS = {
	awsBedrock: (region: string, modelId: string): ProviderConfig => ({
		id: 'aws-bedrock',
		name: 'AWS Bedrock',
		baseURL: `https://bedrock.${region}.amazonaws.com/model/${modelId}`,
		authHeaders: {
			'Authorization': `Bearer ${process.env['AWS_SESSION_TOKEN'] || ''}`,
		},
		defaultModel: modelId,
		modelMapping: {},
	}),

	azureOpenAI: (endpoint: string, deployment: string): ProviderConfig => ({
		id: 'azure-openai',
		name: 'Azure OpenAI',
		baseURL: `${endpoint}/openai/deployments/${deployment}`,
		authHeaders: {
			'api-key': process.env['AZURE_OPENAI_API_KEY'] || '',
			...(process.env['AZURE_OPENAI_API_KEY'] ? {} : { 'Authorization': `Bearer ${process.env['AZURE_OPENAI_TOKEN'] || ''}` }),
		},
		apiVersion: process.env['AZURE_OPENAI_API_VERSION'] || '2024-02-01',
		defaultModel: deployment,
		modelMapping: {},
	}),

	vertexAI: (project: string, location: string): ProviderConfig => ({
		id: 'vertex-ai',
		name: 'Google Vertex AI',
		baseURL: `https://${location}-aiplatform.googleapis.com/v1/project/${project}/location/${location}/publisher/google`,
		authHeaders: {
			'Authorization': `Bearer ${process.env['GOOGLE_CLOUD_TOKEN'] || ''}`,
		},
		defaultModel: 'gemini-2.0-flash',
		modelMapping: {},
	}),

	gateway: (gatewayURL: string, pathPrefix?: string): GatewayConfig => ({
		baseURL: gatewayURL,
		pathPrefix,
		headers: {},
	}),
} as const;

// ============================================================================
// Quick Configuration Helpers
// ============================================================================

/**
 * Create a custom provider configuration object
 * @param options Provider options
 * @returns Provider configuration
 */
export function createProviderConfig(options: {
	id: string;
	name: string;
	baseURL?: string;
	apiKey?: string;
	headers?: Record<string, string>;
	defaultModel?: string;
	modelMapping?: Record<string, string>;
	apiVersion?: string;
}): ProviderConfig {
	const authHeaders: Record<string, string> = {};
	
	if (options.apiKey) {
		// Default to Bearer token (adjust format as needed for your provider)
		authHeaders['Authorization'] = `Bearer ${options.apiKey}`;
	}
	
	if (options.headers) {
		Object.assign(authHeaders, options.headers);
	}

	return {
		id: options.id,
		name: options.name,
		baseURL: options.baseURL || 'https://api.example.com/v1',
		authHeaders,
		defaultModel: options.defaultModel,
		modelMapping: options.modelMapping || {},
		apiVersion: options.apiVersion,
	};
}

/**
 * Clear all custom provider configurations
 */
export function clearProviderConfigs(): void {
	providerConfigs.clear();
	gatewayConfigs.clear();
}

// ============================================================================
// Re-exports
// ============================================================================

export type { ProviderConfig, Provider } from './provider-manager.js';
export { ProviderManager } from './provider-manager.js';
export { ProviderFallbackChain } from './providers.js';
