/**
 * @kishkindhalabs/hanumate-opentelemetry - OpenTelemetry setup helpers for Hanumate
 * 
 * This package provides convenient setup functions for initializing
 * OpenTelemetry tracing in Hanumate applications.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, type Tracer, type Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';

// ============================================================================
// Configuration Types
// ============================================================================

export interface OTelSetupConfig {
	/** Service name (default: 'hanumate') */
	serviceName?: string;
	/** Service version (default: '0.1.0') */
	serviceVersion?: string;
	/** OTLP endpoint for exporting traces */
	otlpEndpoint?: string;
	/** Enable console exporter (default: true for development) */
	consoleExporter?: boolean;
	/** Enable OTLP exporter (default: false) */
	otlpExporter?: boolean;
	/** Sampling ratio (0.0 - 1.0, default: 1.0) */
	sampleRatio?: number;
}

// ============================================================================
// Setup Functions
// ============================================================================

let provider: NodeTracerProvider | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry with the given configuration
 * 
 * @param config - Configuration options for the tracer
 * @returns The tracer instance
 * 
 * @example
 * ```typescript
 * import { setup } from '@kishkindhalabs/hanumate-opentelemetry';
 * 
 * const tracer = setup({
 *   serviceName: 'my-agent',
 *   otlpEndpoint: 'http://localhost:4318/v1/traces',
 *   otlpExporter: true
 * });
 * ```
 */
export function setup(config: OTelSetupConfig = {}): Tracer {
	if (isInitialized) {
		console.warn('[Hanumate OTel] Already initialized. Call shutdown() first to reinitialize.');
		return trace.getTracer(config.serviceName ?? 'hanumate');
	}

	const {
		serviceName = 'hanumate',
		serviceVersion = '0.1.0',
		otlpEndpoint,
		consoleExporter = true,
		otlpExporter = false,
	} = config;

	// Create resource with service information
	const resource = new Resource({
		[ATTR_SERVICE_NAME]: serviceName,
		[ATTR_SERVICE_VERSION]: serviceVersion,
	});

	// Create provider
	provider = new NodeTracerProvider({
		resource,
	});

	// Set up exporters
	if (otlpExporter && otlpEndpoint) {
		const otlp = new OTLPTraceExporter({
			url: otlpEndpoint,
		});
		provider.addSpanProcessor(new BatchSpanProcessor(otlp));
	}

	if (consoleExporter || (!otlpExporter && !otlpEndpoint)) {
		const console = new ConsoleSpanExporter();
		provider.addSpanProcessor(new BatchSpanProcessor(console));
	}

	// Register provider
	provider.register();

	isInitialized = true;

	return trace.getTracer(serviceName, serviceVersion);
}

/**
 * Shutdown the OpenTelemetry provider and flush pending spans
 * 
 * @example
 * ```typescript
 * import { setup, shutdown } from '@kishkindhalabs/hanumate-opentelemetry';
 * 
 * setup({ serviceName: 'my-agent' });
 * 
 * // ... use tracing ...
 * 
 * await shutdown();
 * ```
 */
export async function shutdown(): Promise<void> {
	if (provider) {
		await provider.shutdown();
		provider = null;
		isInitialized = false;
	}
}

/**
 * Check if OTel is initialized
 */
export function isSetup(): boolean {
	return isInitialized;
}

// ============================================================================
// Tracer Helpers
// ============================================================================

/**
 * Get a tracer for a specific component
 * 
 * @param name - Component name (e.g., 'session', 'workflow', 'mcp')
 * @returns Tracer instance
 */
export function getTracer(name: string): Tracer {
	return trace.getTracer(name);
}

// ============================================================================
// Span Wrappers
// ============================================================================

/**
 * Wrap an async function with an active span
 * 
 * @param tracer - Tracer instance
 * @param name - Span name
 * @param fn - Async function to execute
 * @returns Result of the async function
 * 
 * @example
 * ```typescript
 * import { setup, wrapAsync } from '@kishkindhalabs/hanumate-opentelemetry';
 * 
 * const tracer = setup();
 * 
 * const result = await wrapAsync(tracer, 'my-operation', async () => {
 *   // ... do work ...
 *   return 'result';
 * });
 * ```
 */
export async function wrapAsync<T>(
	tracer: Tracer,
	name: string,
	fn: () => Promise<T>
): Promise<T> {
	return tracer.startActiveSpan(name, async (span) => {
		try {
			const result = await fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (e) {
			span.recordException(e instanceof Error ? e : new Error(String(e)));
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw e;
		} finally {
			span.end();
		}
	});
}

/**
 * Wrap a sync function with an active span
 * 
 * @param tracer - Tracer instance
 * @param name - Span name
 * @param fn - Sync function to execute
 * @returns Result of the function
 */
export function wrapSync<T>(
	tracer: Tracer,
	name: string,
	fn: () => T
): T {
	return tracer.startActiveSpan(name, (span) => {
		try {
			const result = fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (e) {
			span.recordException(e instanceof Error ? e : new Error(String(e)));
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw e;
		} finally {
			span.end();
		}
	});
}

// ============================================================================
// Re-exports
// ============================================================================

export { SpanKind, SpanStatusCode, trace };
export type { Tracer, Span } from '@opentelemetry/api';