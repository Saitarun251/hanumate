/**
 * OpenTelemetry Observability Utilities for RubberDuck Runtime
 * 
 * Provides lightweight wrappers for distributed tracing with OpenTelemetry.
 * These utilities integrate with the existing telemetry.ts module.
 */

import { trace, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';

// ============================================================================
// Tracer Factory
// ============================================================================

/**
 * Create a named tracer instance for a specific component
 * @param name - Tracer name (typically package or module name)
 * @returns Tracer instance
 */
export function createTracer(name: string): Tracer {
	return trace.getTracer(name);
}

// ============================================================================
// Span Wrappers
// ============================================================================

/**
 * Wrap an async function with an active span
 * Automatically handles error recording and span status
 * 
 * @param tracer - The tracer instance
 * @param name - Span name
 * @param fn - Async function to execute within the span
 * @returns Result of the async function
 */
export async function wrapWithSpan<T>(
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
 * Wrap a synchronous function with an active span
 * Automatically handles error recording and span status
 * 
 * @param tracer - The tracer instance
 * @param name - Span name
 * @param fn - Synchronous function to execute within the span
 * @returns Result of the function
 */
export function wrapWithSpanSync<T>(
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
// Span Attributes Helpers
// ============================================================================

/**
 * Set common LLM attributes on a span
 */
export function setLLMSpanAttributes(span: Span, attributes: {
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	responseTimeMs?: number;
}): void {
	if (attributes.model) {
		span.setAttribute('llm.model', attributes.model);
	}
	if (attributes.promptTokens !== undefined) {
		span.setAttribute('llm.prompt_tokens', attributes.promptTokens);
	}
	if (attributes.completionTokens !== undefined) {
		span.setAttribute('llm.completion_tokens', attributes.completionTokens);
	}
	if (attributes.totalTokens !== undefined) {
		span.setAttribute('llm.total_tokens', attributes.totalTokens);
	}
	if (attributes.responseTimeMs !== undefined) {
		span.setAttribute('llm.response_time_ms', attributes.responseTimeMs);
	}
}

/**
 * Set tool-related attributes on a span
 */
export function setToolSpanAttributes(span: Span, attributes: {
	name?: string;
	inputSize?: number;
	outputSize?: number;
	durationMs?: number;
	error?: string;
}): void {
	if (attributes.name) {
		span.setAttribute('tool.name', attributes.name);
	}
	if (attributes.inputSize !== undefined) {
		span.setAttribute('tool.input_size', attributes.inputSize);
	}
	if (attributes.outputSize !== undefined) {
		span.setAttribute('tool.output_size', attributes.outputSize);
	}
	if (attributes.durationMs !== undefined) {
		span.setAttribute('tool.duration_ms', attributes.durationMs);
	}
	if (attributes.error) {
		span.setAttribute('tool.error', attributes.error);
	}
}

/**
 * Set workflow-related attributes on a span
 */
export function setWorkflowSpanAttributes(span: Span, attributes: {
	name?: string;
	step?: number;
	totalSteps?: number;
	stepName?: string;
	error?: string;
}): void {
	if (attributes.name) {
		span.setAttribute('workflow.name', attributes.name);
	}
	if (attributes.step !== undefined) {
		span.setAttribute('workflow.step', attributes.step);
	}
	if (attributes.totalSteps !== undefined) {
		span.setAttribute('workflow.total_steps', attributes.totalSteps);
	}
	if (attributes.stepName) {
		span.setAttribute('workflow.step_name', attributes.stepName);
	}
	if (attributes.error) {
		span.setAttribute('workflow.error', attributes.error);
	}
}

// ============================================================================
// Session Prompt Tracing Helper
// ============================================================================

/**
 * Trace a session.prompt() call with timing and token metrics
 */
export async function traceSessionPrompt(
	tracer: Tracer,
	model: string,
	prompt: string,
	fn: () => Promise<string>
): Promise<string> {
	return tracer.startActiveSpan('session.prompt', async (span) => {
		const startTime = Date.now();
		
		span.setAttribute('llm.model', model);
		span.setAttribute('llm.prompt_length', prompt.length);
		
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			
			span.setAttribute('llm.response_length', result.length);
			span.setAttribute('llm.response_time_ms', duration);
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
// Tool Execution Tracing Helper
// ============================================================================

/**
 * Trace a tool execution with input/output metrics
 */
export async function traceToolExecution(
	tracer: Tracer,
	toolName: string,
	fn: () => Promise<unknown>
): Promise<unknown> {
	return tracer.startActiveSpan(`tool.${toolName}`, async (span) => {
		const startTime = Date.now();
		
		span.setAttribute('tool.name', toolName);
		
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			
			// Record output size for complex types
			if (typeof result === 'string') {
				span.setAttribute('tool.output_size', result.length);
			} else if (Array.isArray(result)) {
				span.setAttribute('tool.output_count', result.length);
			} else if (result && typeof result === 'object') {
				span.setAttribute('tool.output_type', 'object');
			}
			
			span.setAttribute('tool.duration_ms', duration);
			span.setStatus({ code: SpanStatusCode.OK });
			
			return result;
		} catch (e) {
			span.recordException(e instanceof Error ? e : new Error(String(e)));
			span.setAttribute('tool.error', e instanceof Error ? e.message : String(e));
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw e;
		} finally {
			span.end();
		}
	});
}

// ============================================================================
// Workflow Execution Tracing Helper
// ============================================================================

/**
 * Trace a workflow execution with step tracking
 */
export async function traceWorkflowExecution(
	tracer: Tracer,
	workflowName: string,
	totalSteps: number,
	fn: () => Promise<unknown>
): Promise<unknown> {
	return tracer.startActiveSpan(`workflow.${workflowName}`, async (span) => {
		const startTime = Date.now();
		
		span.setAttribute('workflow.name', workflowName);
		span.setAttribute('workflow.total_steps', totalSteps);
		
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			
			span.setAttribute('workflow.duration_ms', duration);
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
 * Trace an individual workflow step
 */
export async function traceWorkflowStep(
	tracer: Tracer,
	workflowName: string,
	stepIndex: number,
	stepName: string,
	fn: () => Promise<unknown>
): Promise<unknown> {
	return tracer.startActiveSpan(`workflow.${workflowName}.step.${stepIndex}`, async (span) => {
		const startTime = Date.now();
		
		span.setAttribute('workflow.name', workflowName);
		span.setAttribute('workflow.step', stepIndex);
		span.setAttribute('workflow.step_name', stepName);
		
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			
			span.setAttribute('workflow.step_duration_ms', duration);
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

export { SpanStatusCode } from '@opentelemetry/api';
export type { Tracer, Span } from '@opentelemetry/api';