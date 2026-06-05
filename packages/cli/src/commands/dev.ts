import { Hono } from 'hono';
import {
	executeWorkflow,
	InvalidPayloadError,
	parsePayload,
	WorkflowLoaderError,
} from '../utils/workflow-loader.js';

/**
 * Map error types to HTTP status codes for proper REST responses.
 */
function getHttpStatusCode(errorType?: string): number {
	switch (errorType) {
		case 'NOT_FOUND':
			return 404;
		case 'INVALID_WORKFLOW':
			return 422; // Unprocessable Entity
		case 'VALIDATION_ERROR':
			return 400; // Bad Request
		case 'EXECUTION_ERROR':
		default:
			return 500; // Internal Server Error
	}
}

/**
 * Create the Hono app for HTTP routing.
 * WebSocket handling is managed at the server level in index.ts.
 */
export function createApp() {
	const app = new Hono();

	// Health check endpoint
	app.get('/', (c) =>
		c.json({
			name: 'RubberDuck',
			version: '0.1.0',
			status: 'running',
		})
	);

	// Agent info endpoint (HTTP)
	app.get('/agents/:name/:id', async (c) => {
		const { name, id } = c.req.param();
		return c.json({ agent: name, instance: id });
	});

	// Agent message endpoint (HTTP)
	app.post('/agents/:name/:id', async (c) => {
		const { name, id } = c.req.param();
		const body = await c.req.json();
		return c.json({
			agent: name,
			instance: id,
			response: 'Message received',
		});
	});

	// Workflow endpoints
	app.post('/workflows/:name', async (c) => {
		const { name } = c.req.param();

		// Validate and parse the request body as JSON
		let payload: Record<string, unknown> = {};
		const contentType = c.req.header('content-type');

		if (contentType?.includes('application/json')) {
			try {
				const rawBody = await c.req.raw.text();
				if (rawBody && rawBody.trim()) {
					try {
						payload = parsePayload(rawBody);
					} catch (parseError) {
						const errorMessage =
							parseError instanceof InvalidPayloadError
								? parseError.message
								: parseError instanceof Error
									? parseError.message
									: String(parseError);

						return c.json(
							{
								success: false,
								error: errorMessage,
								errorType: 'VALIDATION_ERROR',
							},
							400
						);
					}
				}
			} catch {
				// Empty body or non-text content - use empty payload
			}
		}

		try {
			const result = await executeWorkflow(name, payload);

			if (!result.success) {
				const statusCode = getHttpStatusCode(result.errorType);
				return c.json(
					{
						success: false,
						error: result.error,
						errorType: result.errorType,
					},
					statusCode
				);
			}

			return c.json({
				success: true,
				result: result.data,
			});
		} catch (error) {
			let errorMessage: string;
			let errorType: string = 'EXECUTION_ERROR';

			if (error instanceof WorkflowLoaderError) {
				errorMessage = error.message;
				errorType = error.errorType ?? 'EXECUTION_ERROR';
			} else if (error instanceof InvalidPayloadError) {
				errorMessage = error.message;
				errorType = 'VALIDATION_ERROR';
			} else {
				errorMessage = error instanceof Error ? error.message : String(error);
			}

			const statusCode = getHttpStatusCode(errorType);

			return c.json(
				{
					success: false,
					error: errorMessage,
					errorType,
				},
				statusCode
			);
		}
	});

	app.get('/workflows/:name', async (c) => {
		const { name } = c.req.param();

		return c.json({
			name,
			status: 'available',
			method: 'POST',
			endpoint: `/workflows/${name}`,
			description: 'POST with JSON body to execute this workflow',
		});
	});

	return app;
}