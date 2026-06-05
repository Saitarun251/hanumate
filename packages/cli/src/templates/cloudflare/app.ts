/**
 * Cloudflare Workers application entry point template.
 * This file is bundled by the Cloudflare Workers build target.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Environment bindings type
interface Env {
	Bindings: {
		// Add your Cloudflare bindings here, e.g.:
		// MY_KV: KVNamespace;
		// MY_D1: D1Database;
	};
}

// Create the Hono app for Cloudflare Workers
const app = new Hono<{ Bindings: Env['Bindings'] }>();

// CORS middleware for cross-origin requests
app.use('*', cors());

// Request logging middleware
app.use('*', logger());

// Health check
app.get('/', (c) =>
	c.json({
		name: 'RubberDuck',
		version: '0.1.0',
		status: 'running',
		target: 'cloudflare',
		environment: c.env?.Bindings ? 'cloudflare-workers' : 'unknown',
	})
);

// Agent info endpoint
app.get('/agents/:name/:id', (c) => {
	const { name, id } = c.req.param();
	return c.json({
		agent: name,
		instance: id,
		target: 'cloudflare',
	});
});

// Agent message endpoint
app.post('/agents/:name/:id', async (c) => {
	const { name, id } = c.req.param();
	const body = await c.req.json().catch(() => ({}));
	return c.json({
		agent: name,
		instance: id,
		response: 'Message received',
		target: 'cloudflare',
		data: body,
	});
});

// Workflows endpoint
app.post('/workflows/:name', async (c) => {
	const { name } = c.req.param();
	const payload = await c.req.json().catch(() => ({}));

	// Placeholder for workflow execution
	// In production, this would load and execute the workflow
	return c.json({
		workflow: name,
		status: 'executed',
		target: 'cloudflare',
		payload,
		result: { message: 'Workflow execution placeholder' },
	});
});

// Get workflow info
app.get('/workflows/:name', (c) => {
	const { name } = c.req.param();
	return c.json({
		name,
		status: 'available',
		method: 'POST',
		endpoint: `/workflows/${name}`,
		target: 'cloudflare',
	});
});

// 404 handler
app.notFound((c) => {
	return c.json(
		{
			error: 'Not Found',
			path: c.req.path,
			target: 'cloudflare',
		},
		404
	);
});

// Error handler
app.onError((err, c) => {
	console.error('Error:', err);
	return c.json(
		{
			error: err.message || 'Internal Server Error',
			target: 'cloudflare',
		},
		500
	);
});

// Export for Cloudflare Workers
export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env['Bindings']>;

export { app };