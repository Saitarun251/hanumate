/**
 * RubberDuck GitHub App
 * Main entry point with Probot/Octokit setup
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApp } from './app.js';

// Load env
import 'dotenv/config';

// Logger interface - structured logging for production
const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL !== 'silent') {
      console.debug(JSON.stringify({ timestamp: new Date().toISOString(), level: 'debug', message: msg, service: 'rubberduck-github-app', ...meta }));
    }
  },
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL !== 'silent') {
      console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: msg, service: 'rubberduck-github-app', ...meta }));
    }
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message: msg, service: 'rubberduck-github-app', ...meta }));
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: msg, service: 'rubberduck-github-app', ...meta }));
  },
};

// ============================================
// Main Entry Point
// ============================================

async function main() {
  // Check required environment variables
  const appId = parseInt(process.env.GITHUB_APP_ID || '', 10);
  let privateKey = process.env.GITHUB_PRIVATE_KEY || '';

  // Support private key from file path
  const privateKeyFile = process.env.GITHUB_PRIVATE_KEY_FILE;
  if (!privateKey && privateKeyFile) {
    const fs = await import('node:fs/promises');
    try {
      privateKey = await fs.readFile(privateKeyFile, 'utf-8');
    } catch {
      console.error('Failed to read private key from:', privateKeyFile);
      process.exit(1);
    }
  }

  const webhookSecret = process.env.WEBHOOK_SECRET || 'development';

  if (!appId || !privateKey) {
    console.error('Missing required environment variables:');
    console.error('  GITHUB_APP_ID - GitHub App ID');
    console.error('  GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_FILE - Private key');
    process.exit(1);
  }

  const development = process.env.NODE_ENV !== 'production';

  // Create Probot app
  const probot = createApp({
    appId,
    privateKey,
    webhookSecret,
    rubberduck: {
      apiUrl: process.env.RUBBERDUCK_API_URL || 'http://localhost:3000',
      apiKey: process.env.RUBBERDUCK_API_KEY,
      defaultTimeout: parseInt(process.env.TASK_TIMEOUT || '300000', 10),
    },
    webhook: {
      enableAll: development,
    },
    development,
  });

  // Create Hono app for HTTP handling
  const hono = new Hono();

  // Health check
  hono.get('/health', (c) => c.json({
    status: 'ok',
    service: 'rubberduck-github-app',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // GitHub webhook endpoint
  hono.post('/webhooks/github', async (c) => {
    const payload = await c.req.text();
    const signature = c.req.header('x-hub-signature-256') || '';
    const deliveryId = c.req.header('x-github-delivery') || '';
    const event = c.req.header('x-github-event') || 'push';

    logger.info(`Webhook received`, { deliveryId, event });

    try {
      // Forward to Probot
      // @ts-ignore - Probot's webhook handling
      await probot.webhooks.verifyAndReceive({
        id: deliveryId,
        name: event as any,
        payload,
        signature,
      });

      return c.json({ received: true, deliveryId });
    } catch (error) {
      logger.error(`Webhook processing failed: ${error}`, { deliveryId });
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Start server
  const port = parseInt(process.env.PORT || '3000', 10);

  logger.info(`Starting RubberDuck GitHub App on port ${port}`);

  const server = serve({
    fetch: hono.fetch,
    port,
  });

  logger.info(`Server running on http://localhost:${port}`);
}

main().catch(console.error);