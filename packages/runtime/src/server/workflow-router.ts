/**
 * Workflow Router - HTTP route handlers for workflow management
 *
 * Provides REST API endpoints for workflow execution via Hono server.
 * Supports GET (retrieve workflow info/execute) and POST (execute workflow)
 * with middleware support for auth and logging.
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Workflow definition interface
 */
export interface WorkflowDefinition {
	/** Unique workflow identifier */
	name: string;
	/** Human-readable description */
	description?: string;
	/** Workflow steps/handlers */
	steps: WorkflowStep[];
	/** Metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Individual workflow step
 */
export interface WorkflowStep {
	/** Step identifier */
	id: string;
	/** Step name */
	name: string;
	/** Step handler function */
	handler: WorkflowStepHandler;
	/** Optional step configuration */
	config?: Record<string, unknown>;
}

/**
 * Workflow step handler function
 */
export type WorkflowStepHandler = (
	context: WorkflowContext
) => Promise<WorkflowStepResult>;

/**
 * Workflow execution context
 */
export interface WorkflowContext {
	/** Workflow name */
	workflowName: string;
	/** Request parameters */
	params: Record<string, string>;
	/** Query parameters */
	query: Record<string, string>;
	/** Request body */
	body: unknown;
	/** User context */
	user?: WorkflowUser;
	/** Metadata */
	metadata: Record<string, unknown>;
}

/**
 * Workflow user context
 */
export interface WorkflowUser {
	/** User ID */
	id?: string;
	/** User roles */
	roles?: string[];
	/** Custom user data */
	[key: string]: unknown;
}

/**
 * Workflow step execution result
 */
export interface WorkflowStepResult {
	/** Whether step succeeded */
	success: boolean;
	/** Step output data */
	data?: unknown;
	/** Error message if failed */
	error?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
	/** Workflow name */
	workflowName: string;
	/** Whether workflow succeeded */
	success: boolean;
	/** Execution results from steps */
	steps: WorkflowStepResult[];
	/** Total execution time in ms */
	duration: number;
	/** Error if workflow failed */
	error?: string;
}

/**
 * Workflow registration
 */
export interface WorkflowRegistration {
	/** Workflow definition */
	definition: WorkflowDefinition;
	/** When workflow was registered */
	registeredAt: number;
	/** Execution count */
	executions: number;
	/** Last execution time */
	lastExecutedAt?: number;
}

/**
 * Middleware function type
 */
export type Middleware = (c: Context, next: Next) => Promise<Response | void>;

/**
 * Auth middleware options
 */
export interface AuthMiddlewareOptions {
	/** Validate authorization header */
	validateToken?: (token: string) => Promise<WorkflowUser | null>;
	/** Skip auth for certain workflows */
	skipPaths?: string[];
	/** Require authentication by default */
	requireAuth?: boolean;
}

/**
 * Logging middleware options
 */
export interface LoggingMiddlewareOptions {
	/** Log request body */
	logBody?: boolean;
	/** Log response body */
	logResponse?: boolean;
	/** Custom logger function */
	logger?: (log: WorkflowLogEntry) => void;
}

/**
 * Log entry for workflow operations
 */
export interface WorkflowLogEntry {
	/** Log timestamp */
	timestamp: number;
	/** HTTP method */
	method: string;
	/** Request path */
	path: string;
	/** Workflow name */
	workflowName?: string;
	/** User ID if authenticated */
	userId?: string;
	/** Response status */
	status: number;
	/** Execution duration in ms */
	duration: number;
	/** Error message if any */
	error?: string;
}

/**
 * Workflow router configuration
 */
export interface WorkflowRouterConfig {
	/** Base path for workflow routes (default: /workflows) */
	basePath?: string;
	/** Auth middleware options */
	auth?: AuthMiddlewareOptions;
	/** Logging middleware options */
	logging?: LoggingMiddlewareOptions;
	/** Custom middleware to apply */
	middleware?: Middleware[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique execution ID
 */
function generateExecutionId(): string {
	return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Parse authorization header
 */
function parseAuthHeader(authHeader: string | undefined): string | null {
	if (!authHeader) return null;
	if (authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}
	return authHeader;
}

// ============================================================================
// Workflow Router Class
// ============================================================================

/**
 * WorkflowRouter - Manages HTTP routes for workflow execution
 *
 * Provides GET and POST handlers for /workflows/:name endpoints
 * with middleware support for authentication and logging.
 *
 * @example
 * ```typescript
 * import { WorkflowRouter } from './workflow-router.js';
 *
 * const router = new WorkflowRouter({
 *   basePath: '/workflows',
 *   auth: { requireAuth: true },
 *   logging: { logBody: false }
 * });
 *
 * // Register a workflow
 * router.register({
 *   name: 'greeting',
 *   description: 'Generate a greeting message',
 *   steps: [{
 *     id: 'hello',
 *     name: 'Say Hello',
 *     handler: async (ctx) => {
 *       return { success: true, data: { message: 'Hello!' } };
 *     }
 *   }]
 * });
 *
 * // Mount on Hono app
 * app.route('/api', router.getApp());
 * ```
 */
export class WorkflowRouter {
	private workflows: Map<string, WorkflowRegistration> = new Map();
	private app: Hono;
	private config: Required<WorkflowRouterConfig>;

	constructor(config: WorkflowRouterConfig = {}) {
		this.config = {
			basePath: config.basePath ?? '/workflows',
			auth: config.auth ?? {},
			logging: config.logging ?? {},
			middleware: config.middleware ?? [],
		};

		this.app = new Hono();
		this.setupMiddleware();
		this.setupRoutes();
	}

	/**
	 * Get the Hono app instance for mounting
	 */
	getApp(): Hono {
		return this.app;
	}

	/**
	 * Register a workflow handler
	 */
	register(definition: WorkflowDefinition): void {
		if (this.workflows.has(definition.name)) {
			throw new Error(`Workflow already registered: ${definition.name}`);
		}

		this.workflows.set(definition.name, {
			definition,
			registeredAt: Date.now(),
			executions: 0,
		});

		console.log(`Workflow registered: ${definition.name}`);
	}

	/**
	 * Unregister a workflow handler
	 */
	unregister(name: string): boolean {
		return this.workflows.delete(name);
	}

	/**
	 * Get workflow registration info
	 */
	getWorkflow(name: string): WorkflowRegistration | undefined {
		return this.workflows.get(name);
	}

	/**
	 * List all registered workflows
	 */
	listWorkflows(): WorkflowRegistration[] {
		return Array.from(this.workflows.values());
	}

	/**
	 * Setup middleware stack
	 */
	private setupMiddleware(): void {
		// Custom middleware first
		for (const mw of this.config.middleware) {
			this.app.use('*', mw);
		}

		// Auth middleware
		if (this.config.auth) {
			this.app.use('*', this.createAuthMiddleware());
		}

		// Logging middleware
		if (this.config.logging) {
			this.app.use('*', this.createLoggingMiddleware());
		}
	}

	/**
	 * Create authentication middleware
	 */
	private createAuthMiddleware(): Middleware {
		return async (c, next) => {
			const path = c.req.path;
			const skipPaths = this.config.auth.skipPaths ?? [];

			// Check if path should skip auth
			if (skipPaths.some((p) => path.startsWith(p))) {
				return next();
			}

			// Get auth header
			const authHeader = c.req.header('Authorization');
			const token = parseAuthHeader(authHeader);

			// If auth is not required and no token provided, continue
			if (!this.config.auth.requireAuth && !token) {
				return next();
			}

			// Require token
			if (!token) {
				return c.json({
					success: false,
					error: 'Authentication required',
				}, 401);
			}

			// Validate token
			if (this.config.auth.validateToken) {
				const user = await this.config.auth.validateToken(token);
				if (!user) {
					return c.json({
						success: false,
						error: 'Invalid authentication token',
					}, 401);
				}
				// Store user in context
				(c as unknown as { set: (key: string, value: unknown) => void }).set('workflowUser', user);
			}

			return next();
		};
	}

	/**
	 * Create logging middleware
	 */
	private createLoggingMiddleware(): Middleware {
		const logOptions = this.config.logging;
		const defaultLogger = logOptions.logger ?? ((entry: WorkflowLogEntry) => {
			const level = entry.error ? 'error' : 'info';
			console[level](`[${entry.method}] ${entry.path} - ${entry.status} (${entry.duration}ms)`);
		});

		return async (c, next) => {
			const start = Date.now();
			const method = c.req.method;
			const path = c.req.path;
			const ctx = c as unknown as { set: (key: string, value: unknown) => void; get: (key: string) => unknown };

			// Store start time for response logging
			ctx.set('workflowStartTime', start);

			await next();

			const duration = Date.now() - start;
			const status = c.res.status;

			// Extract workflow name from path
			const workflowMatch = path.match(/\/workflows\/([^/]+)/);
			const workflowName = workflowMatch?.[1];

			// Get user ID if available
			const user = ctx.get('workflowUser') as WorkflowUser | undefined;

			// Log entry
			const entry: WorkflowLogEntry = {
				timestamp: start,
				method,
				path,
				workflowName,
				userId: user?.id,
				status,
				duration,
			};

			defaultLogger(entry);
		};
	}

	/**
	 * Setup workflow routes
	 */
	private setupRoutes(): void {
		const basePath = this.config.basePath;

		// List all workflows
		this.app.get(basePath, async (c) => {
			const workflows = this.listWorkflows();
			return c.json({
				workflows: workflows.map((reg) => ({
					name: reg.definition.name,
					description: reg.definition.description,
					stepsCount: reg.definition.steps.length,
					registeredAt: reg.registeredAt,
					executions: reg.executions,
					lastExecutedAt: reg.lastExecutedAt,
				})),
				count: workflows.length,
			});
		});

		// Get workflow info (GET /workflows/:name)
		this.app.get(`${basePath}/:name`, async (c) => {
			const name = c.req.param('name');
			const registration = this.workflows.get(name);

			if (!registration) {
				return c.json({
					success: false,
					error: `Workflow not found: ${name}`,
				}, 404);
			}

			const { definition, registeredAt, executions, lastExecutedAt } = registration;

			return c.json({
				success: true,
				workflow: {
					name: definition.name,
					description: definition.description,
					steps: definition.steps.map((step) => ({
						id: step.id,
						name: step.name,
						config: step.config,
					})),
					metadata: definition.metadata,
					registeredAt,
					executions,
					lastExecutedAt,
				},
			});
		});

		// Execute workflow (POST /workflows/:name)
		this.app.post(`${basePath}/:name`, async (c) => {
			const name = c.req.param('name');
			const registration = this.workflows.get(name);

			if (!registration) {
				return c.json({
					success: false,
					error: `Workflow not found: ${name}`,
				}, 404);
			}

			// Parse request
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				body = {};
			}

			// Get user from context if set by auth middleware
			const ctx = c as unknown as { get: (key: string) => unknown };
			const user = ctx.get('workflowUser') as WorkflowUser | undefined;

			// Create workflow context
			const context: WorkflowContext = {
				workflowName: name,
				params: c.req.param(),
				query: Object.fromEntries(
					c.req.path
						.split('?')[1]
						?.split('&')
						.map((s: string) => s.split('=')) ?? []
				),
				body,
				user,
				metadata: {
					executionId: generateExecutionId(),
					requestId: ctx.get('requestId') as string ?? generateExecutionId(),
				},
			};

			// Execute workflow
			const startTime = Date.now();
			const result = await this.executeWorkflow(registration.definition, context);
			result.duration = Date.now() - startTime;

			// Update execution stats
			registration.executions++;
			registration.lastExecutedAt = Date.now();

			// Return result
			const status = result.success ? 200 : 500;
			return c.json(result, status);
		});

		// Dry-run workflow (POST /workflows/:name/dry-run)
		this.app.post(`${basePath}/:name/dry-run`, async (c) => {
			const name = c.req.param('name');
			const registration = this.workflows.get(name);

			if (!registration) {
				return c.json({
					success: false,
					error: `Workflow not found: ${name}`,
				}, 404);
			}

			// Return workflow definition without executing
			return c.json({
				success: true,
				workflow: {
					name: registration.definition.name,
					description: registration.definition.description,
					steps: registration.definition.steps.map((step) => ({
						id: step.id,
						name: step.name,
						config: step.config,
					})),
				},
				message: 'Dry run - workflow not executed',
			});
		});
	}

	/**
	 * Execute a workflow definition
	 */
	private async executeWorkflow(
		definition: WorkflowDefinition,
		context: WorkflowContext
	): Promise<WorkflowResult> {
		const stepResults: WorkflowStepResult[] = [];
		let overallSuccess = true;
		let errorMessage: string | undefined;

		for (const step of definition.steps) {
			try {
				const stepContext: WorkflowContext = {
					...context,
					metadata: {
						...context.metadata,
						currentStep: step.id,
						previousResults: stepResults,
					},
				};

				const result = await step.handler(stepContext);
				stepResults.push(result);

				if (!result.success) {
					overallSuccess = false;
					errorMessage = result.error ?? `Step ${step.id} failed`;
					break;
				}
			} catch (err) {
				overallSuccess = false;
				errorMessage = err instanceof Error ? err.message : 'Unknown error';
				stepResults.push({
					success: false,
					error: errorMessage,
				});
				break;
			}
		}

		return {
			workflowName: definition.name,
			success: overallSuccess,
			steps: stepResults,
			duration: 0, // Will be set by caller
			error: errorMessage,
		};
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new WorkflowRouter instance
 */
export function createWorkflowRouter(config?: WorkflowRouterConfig): WorkflowRouter {
	return new WorkflowRouter(config);
}