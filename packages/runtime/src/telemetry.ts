/**
 * OpenTelemetry integration for Hanumate runtime
 * Provides distributed tracing for agent execution
 */

import type { Span, Tracer, context, Context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context as otelContext, SpanKind, SpanStatusCode } from '@opentelemetry/api';

// ============================================================================
// Configuration Types
// ============================================================================

export interface TelemetryConfig {
	/** Enable/disable telemetry (default: true) */
	enabled?: boolean;
	/** Service name for traces (default: 'hanumate-runtime') */
	serviceName?: string;
	/** Service version */
	serviceVersion?: string;
	/** OTLP endpoint for exporting traces */
	endpoint?: string;
	/** Exporter type: 'console' | 'otlp' (default: 'console') */
	exporter?: 'console' | 'otlp';
	/** Sampling strategy: 'always' | 'never' | 'ratio' (default: 'always') */
	sampling?: 'always' | 'never' | 'ratio';
	/** Sample ratio when sampling is 'ratio' (0.0 - 1.0) */
	sampleRatio?: number;
}

export interface SpanAttributes {
	[key: string]: string | number | boolean | undefined;
}

// ============================================================================
// Telemetry State
// ============================================================================

let provider: NodeTracerProvider | null = null;
let tracer: Tracer | null = null;
let isInitialized = false;
let currentConfig: TelemetryConfig = {};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize OpenTelemetry with the given configuration
 */
export function initTelemetry(config: TelemetryConfig = {}): void {
	if (isInitialized) {
		console.warn('Telemetry already initialized. Call shutdownTelemetry() first to reinitialize.');
		return;
	}

	currentConfig = {
		enabled: true,
		serviceName: 'hanumate-runtime',
		serviceVersion: '0.1.0',
		exporter: 'console',
		sampling: 'always',
		sampleRatio: 1.0,
		...config,
	};

	// If disabled, skip initialization
	if (!currentConfig.enabled) {
		trace.disable();
		return;
	}

	// Create resource with service information
	const resource = new Resource({
		[ATTR_SERVICE_NAME]: currentConfig.serviceName,
		[ATTR_SERVICE_VERSION]: currentConfig.serviceVersion,
	});

	// Create provider
	provider = new NodeTracerProvider({
		resource,
	});

	// Set up exporter based on configuration
	if (currentConfig.exporter === 'otlp' && currentConfig.endpoint) {
		const otlpExporter = new OTLPTraceExporter({
			url: currentConfig.endpoint,
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		provider.addSpanProcessor(new BatchSpanProcessor(otlpExporter as any));
	} else {
		// Default to console exporter
		const consoleExporter = new ConsoleSpanExporter();
		provider.addSpanProcessor(new BatchSpanProcessor(consoleExporter));
	}

	// Register provider
	provider.register();

	// Create tracer
	tracer = trace.getTracer(currentConfig.serviceName!, currentConfig.serviceVersion);
	isInitialized = true;
}

/**
 * Shutdown telemetry and flush pending spans
 */
export async function shutdownTelemetry(): Promise<void> {
	if (provider) {
		await provider.shutdown();
		provider = null;
		tracer = null;
		isInitialized = false;
	}
}

/**
 * Get the current tracer instance
 */
export function getTracer(): Tracer | null {
	return tracer;
}

/**
 * Check if telemetry is initialized and enabled
 */
export function isTelemetryEnabled(): boolean {
	return isInitialized && currentConfig.enabled !== false;
}

// ============================================================================
// Span Creation Helpers
// ============================================================================

export interface SpanOptions {
	name: string;
	attributes?: SpanAttributes;
	kind?: SpanKind;
}

/**
 * Create a new span
 */
export function startSpan(options: SpanOptions): Span | null {
	if (!isTelemetryEnabled() || !tracer) {
		return null;
	}

	const span = tracer.startSpan(options.name, {
		kind: options.kind ?? SpanKind.INTERNAL,
		attributes: options.attributes,
	});

	return span;
}

/**
 * Execute a function within a span context
 */
export async function withSpan<T>(
	options: SpanOptions,
	fn: (span: Span) => Promise<T>
): Promise<T> {
	if (!isTelemetryEnabled() || !tracer) {
		return fn(null as unknown as Span);
	}

	return tracer.startActiveSpan(options.name, { kind: options.kind ?? SpanKind.INTERNAL }, async (span) => {
		if (options.attributes) {
			span.setAttributes(options.attributes);
		}
		try {
			const result = await fn(span);
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : 'Unknown error',
			});
			throw error;
		} finally {
			span.end();
		}
	});
}

/**
 * Execute a synchronous function within a span context
 */
export function withSpanSync<T>(
	options: SpanOptions,
	fn: (span: Span) => T
): T {
	if (!isTelemetryEnabled() || !tracer) {
		return fn(null as unknown as Span);
	}

	return tracer.startActiveSpan(options.name, { kind: options.kind ?? SpanKind.INTERNAL }, (span) => {
		if (options.attributes) {
			span.setAttributes(options.attributes);
		}
		try {
			const result = fn(span);
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : 'Unknown error',
			});
			throw error;
		} finally {
			span.end();
		}
	});
}

// ============================================================================
// Decorators
// ============================================================================

/**
 * Decorator for tracing async methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function traced<T extends (...args: any[]) => Promise<unknown>>(
	target: object,
	propertyKey: string,
	descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
	if (!descriptor.value) {
		return descriptor;
	}

	const originalMethod = descriptor.value;

	descriptor.value = function (this: unknown, ...args: unknown[]) {
		const spanName = `${target.constructor?.name || target}.${propertyKey}`;

		return withSpan(
			{ name: spanName, kind: SpanKind.INTERNAL },
			async (span) => {
				// Add method arguments as span attributes (limited to avoid large payloads)
				if (span && args.length > 0) {
					const argSummary = args.map((a) => (typeof a === 'string' ? a.substring(0, 100) : typeof a)).join(', ');
					span.setAttribute('args.count', args.length);
					span.setAttribute('args.types', argSummary);
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return (originalMethod as any).apply(this, args) as Promise<unknown>;
			}
		) as unknown as T;
	} as unknown as T;

	return descriptor;
}

/**
 * Decorator for tracing sync methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tracedSync<T extends (...args: any[]) => unknown>(
	target: object,
	propertyKey: string,
	descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
	if (!descriptor.value) {
		return descriptor;
	}

	const originalMethod = descriptor.value;

	descriptor.value = function (this: unknown, ...args: unknown[]) {
		const spanName = `${target.constructor?.name || target}.${propertyKey}`;

		return withSpanSync(
			{ name: spanName, kind: SpanKind.INTERNAL },
			(span) => {
				if (span && args.length > 0) {
					const argSummary = args.map((a) => (typeof a === 'string' ? a.substring(0, 100) : typeof a)).join(', ');
					span.setAttribute('args.count', args.length);
					span.setAttribute('args.types', argSummary);
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return (originalMethod as any).apply(this, args) as unknown;
			}
		) as T;
	} as T;

	return descriptor;
}

// ============================================================================
// Trace Helper Functions
// ============================================================================

/**
 * Trace a prompt execution
 */
export async function tracePrompt(
	model: string,
	promptLength: number,
	fn: () => Promise<string>
): Promise<string> {
	return withSpan(
		{
			name: 'session.prompt',
			kind: SpanKind.CLIENT,
			attributes: {
				'llm.model': model,
				'llm.prompt_length': promptLength,
			},
		},
		async (span) => {
			const result = await fn();
			if (span) {
				span.setAttribute('llm.response_length', result.length);
			}
			return result;
		}
	);
}

/**
 * Trace skill execution
 */
export async function traceSkillExecution(
	skillName: string,
	fn: () => Promise<string>
): Promise<string> {
	return withSpan(
		{
			name: 'session.runSkill',
			kind: SpanKind.INTERNAL,
			attributes: {
				'skill.name': skillName,
			},
		},
		async (span) => {
			const result = await fn();
			if (span) {
				span.setAttribute('result.length', result.length);
			}
			return result;
		}
	);
}

/**
 * Trace shell command execution
 */
export async function traceShellCommand(
	command: string,
	cwd: string | undefined,
	fn: () => Promise<{ stdout: string; stderr: string; exitCode: number | null }>
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return withSpan(
		{
			name: 'shell.exec',
			kind: SpanKind.CLIENT,
			attributes: {
				'shell.command': command.substring(0, 500), // Truncate long commands
				'shell.cwd': cwd ?? '',
			},
		},
		async (span) => {
			const result = await fn();
			if (span) {
				span.setAttribute('shell.exit_code', result.exitCode ?? -1);
				span.setAttribute('shell.stdout_length', result.stdout.length);
				span.setAttribute('shell.stderr_length', result.stderr.length);
			}
			return result;
		}
	);
}

/**
 * Trace filesystem operation
 */
export async function traceFsOperation(
	operation: 'read' | 'write' | 'mkdir' | 'delete' | 'glob' | 'listDir' | 'copy' | 'move',
	path: string,
	fn: () => Promise<unknown>
): Promise<unknown> {
	return withSpan(
		{
			name: `fs.${operation}`,
			kind: SpanKind.CLIENT,
			attributes: {
				'fs.operation': operation,
				'fs.path': path,
			},
		},
		async (span) => {
			const result = await fn();
			if (span) {
				if (Array.isArray(result)) {
					span.setAttribute('fs.result_count', result.length);
				} else if (typeof result === 'string') {
					span.setAttribute('fs.result_length', result.length);
				}
			}
			return result;
		}
	);
}

/**
 * Trace MCP server lifecycle
 */
export async function traceMCPOperation(
	serverName: string,
	operation: 'connect' | 'disconnect' | 'callTool',
	fn: () => Promise<unknown>
): Promise<unknown> {
	return withSpan(
		{
			name: `mcp.${operation}`,
			kind: operation === 'connect' ? SpanKind.SERVER : SpanKind.CLIENT,
			attributes: {
				'mcp.server_name': serverName,
				'mcp.operation': operation,
			},
		},
		async (span) => {
			const result = await fn();
			if (span) {
				span.setAttribute('mcp.success', true);
			}
			return result;
		}
	);
}

// ============================================================================
// Re-exports
// ============================================================================

export { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
export type { Span, Tracer, context, Context } from '@opentelemetry/api';
