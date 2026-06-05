import { init } from '@rubberduck/runtime';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// OpenTelemetry imports (optional - graceful fallback if not available)
let trace: typeof import('@opentelemetry/api').trace | null = null;
let SpanStatusCode: typeof import('@opentelemetry/api').SpanStatusCode | null = null;

try {
	const otel = await import('@opentelemetry/api');
	trace = otel.trace;
	SpanStatusCode = otel.SpanStatusCode;
} catch {
	// OpenTelemetry not available - continue without tracing
}

// ============================================================================
// Workflow Tracing
// ============================================================================

function getWorkflowTracer() {
	if (!trace) return null;
	return trace.getTracer('rubberduck-workflow');
}

async function traceWorkflowExecution(
	name: string,
	fn: () => Promise<unknown>
): Promise<unknown> {
	const tracer = getWorkflowTracer();
	if (!tracer || !SpanStatusCode) {
		return fn();
	}

	return tracer.startActiveSpan(`workflow.${name}`, async (span) => {
		span.setAttribute('workflow.name', name);
		span.setAttribute('workflow.type', 'execute');

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

export interface WorkflowContext {
	init: typeof init;
	payload: Record<string, unknown>;
}

export interface WorkflowResult {
	success: boolean;
	data?: unknown;
	error?: string;
	errorType?: 'NOT_FOUND' | 'INVALID_WORKFLOW' | 'EXECUTION_ERROR' | 'VALIDATION_ERROR';
}

export interface Workflow {
	run(context: WorkflowContext): Promise<unknown>;
}

const WORKFLOWS_DIR = '.rubberduck/workflows';

/**
 * Custom error class for workflow-related errors.
 * Includes errorType for proper HTTP status code mapping.
 */
export class WorkflowLoaderError extends Error {
	errorType: WorkflowResult['errorType'];

	constructor(message: string, errorType: WorkflowResult['errorType'] = 'EXECUTION_ERROR') {
		super(message);
		this.name = 'WorkflowLoaderError';
		this.errorType = errorType;
	}
}

/**
 * Error thrown when a workflow file is not found.
 */
export class WorkflowNotFoundError extends WorkflowLoaderError {
	constructor(workflowName: string, workflowPath?: string) {
		const message = workflowPath
			? `Workflow "${workflowName}" not found at ${workflowPath}`
			: `Workflow "${workflowName}" not found`;
		super(message, 'NOT_FOUND');
		this.name = 'WorkflowNotFoundError';
	}
}

/**
 * Error thrown when workflow directory cannot be located.
 */
export class WorkflowDirNotFoundError extends WorkflowLoaderError {
	constructor() {
		super(
			`Could not find ${WORKFLOWS_DIR} directory. ` +
			`Make sure you are running from a project directory with workflows configured.`,
			'NOT_FOUND'
		);
		this.name = 'WorkflowDirNotFoundError';
	}
}

/**
 * Error thrown when workflow does not export a valid run() function.
 */
export class InvalidWorkflowError extends WorkflowLoaderError {
	constructor(workflowName: string) {
		super(
			`Workflow "${workflowName}" does not export a valid run() function. ` +
			`Expected: export async function run(context: WorkflowContext)`,
			'INVALID_WORKFLOW'
		);
		this.name = 'InvalidWorkflowError';
	}
}

/**
 * Error thrown when payload JSON is invalid.
 */
export class InvalidPayloadError extends WorkflowLoaderError {
	constructor(detail?: string) {
		const message = detail
			? `Invalid payload JSON: ${detail}`
			: 'Invalid payload JSON: expected valid JSON object';
		super(message, 'VALIDATION_ERROR');
		this.name = 'InvalidPayloadError';
	}
}

function findWorkflowDir(): string {
	// Start from current working directory and walk up looking for .rubberduck/workflows
	let dir = process.cwd();

	for (let i = 0; i < 10; i++) {
		const workflowsPath = join(dir, WORKFLOWS_DIR);
		if (existsSync(workflowsPath)) {
			return workflowsPath;
		}

		const parent = resolve(dir, '..');
		if (parent === dir) break;
		dir = parent;
	}

	throw new WorkflowDirNotFoundError();
}

export async function loadWorkflow(name: string): Promise<Workflow> {
	const workflowsDir = findWorkflowDir();
	const workflowPath = join(workflowsDir, `${name}.ts`);

	if (!existsSync(workflowPath)) {
		throw new WorkflowNotFoundError(name, workflowPath);
	}

	try {
		const module = await import(workflowPath);

		if (typeof module.run !== 'function') {
			throw new InvalidWorkflowError(name);
		}

		return module as Workflow;
	} catch (error) {
		if (error instanceof WorkflowLoaderError) {
			throw error;
		}

		const message = error instanceof Error ? error.message : String(error);
		throw new WorkflowLoaderError(
			`Failed to load workflow "${name}": ${message}`,
			'EXECUTION_ERROR'
		);
	}
}

export async function executeWorkflow(
	name: string,
	payload: Record<string, unknown> = {}
): Promise<WorkflowResult> {
	try {
		const workflow = await loadWorkflow(name);

		const result = await traceWorkflowExecution(name, async () => {
			return workflow.run({
				init,
				payload,
			});
		});

		return {
			success: true,
			data: result,
		};
	} catch (error) {
		let errorMessage: string;
		let errorType: WorkflowResult['errorType'] = 'EXECUTION_ERROR';

		if (error instanceof WorkflowNotFoundError) {
			errorMessage = error.message;
			errorType = 'NOT_FOUND';
		} else if (error instanceof InvalidWorkflowError) {
			errorMessage = error.message;
			errorType = 'INVALID_WORKFLOW';
		} else if (error instanceof InvalidPayloadError) {
			errorMessage = error.message;
			errorType = 'VALIDATION_ERROR';
		} else if (error instanceof WorkflowLoaderError) {
			errorMessage = error.message;
			errorType = error.errorType;
		} else {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		console.error(`Workflow "${name}" failed:`, errorMessage);

		return {
			success: false,
			error: errorMessage,
			errorType,
		};
	}
}

/**
 * Parse and validate a JSON payload string.
 * Throws InvalidPayloadError if the payload is not valid JSON.
 */
export function parsePayload(payloadStr: string): Record<string, unknown> {
	if (!payloadStr || payloadStr === '{}') {
		return {};
	}

	try {
		const parsed = JSON.parse(payloadStr);

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new InvalidPayloadError('payload must be a JSON object');
		}

		return parsed as Record<string, unknown>;
	} catch (error) {
		if (error instanceof InvalidPayloadError) {
			throw error;
		}
		throw new InvalidPayloadError(
			error instanceof Error ? error.message : String(error)
		);
	}
}

export function isWorkflowResult(obj: unknown): obj is WorkflowResult {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'success' in obj &&
		typeof (obj as Record<string, unknown>).success === 'boolean'
	);
}
