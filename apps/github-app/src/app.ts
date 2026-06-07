/**
 * Hanumate GitHub App
 * Main entry point with Probot/Octokit setup
 */

import { Probot } from 'probot';
import { createWebhookRouter, type WebhookRouterConfig } from './webhooks.js';
import { createHanumateService, type HanumateConfig } from './services/hanumate.js';
import { createRepoManager } from './services/repo-manager.js';
import { createPRManager } from './services/pr-manager.js';
import { createIssueHandler } from './handlers/issue.js';
import { createPRHandler } from './handlers/pr.js';
import { createLabelHandler } from './handlers/label.js';
import { createMentionHandler } from './handlers/mention.js';
import { createBranchHandler } from './handlers/branch.js';
import { createActionsHandler } from './handlers/actions.js';

// Types
import type { Logger, AgentTask, TaskResult } from './types.js';

// Logger interface - structured logging for production
const logger: Logger = {
  debug: (msg, meta) => {
    if (process.env.LOG_LEVEL !== 'silent') {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'debug',
        message: msg,
        service: 'hanumate-github-app',
        ...meta,
      };
      console.debug(JSON.stringify(entry));
    }
  },
  info: (msg, meta) => {
    if (process.env.LOG_LEVEL !== 'silent') {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: msg,
        service: 'hanumate-github-app',
        ...meta,
      };
      console.info(JSON.stringify(entry));
    }
  },
  warn: (msg, meta) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: msg,
      service: 'hanumate-github-app',
      ...meta,
    };
    console.warn(JSON.stringify(entry));
  },
  error: (msg, meta) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: msg,
      service: 'hanumate-github-app',
      ...meta,
    };
    console.error(JSON.stringify(entry));
  },
};

// Application configuration
export interface AppConfig {
  /** Probot app ID */
  appId: number;
  /** Private key path or content */
  privateKey: string;
  /** Webhook secret */
  webhookSecret: string;
  /** Hanumate runtime configuration */
  hanumate?: Partial<HanumateConfig>;
  /** Webhook router configuration */
  webhook?: WebhookRouterConfig;
  /** Development mode (skip verification) */
  development?: boolean;
}

/**
 * Create and configure the GitHub App
 */
export function createApp(options: AppConfig): Probot {
  const {
    appId,
    privateKey,
    webhookSecret,
    hanumate: hanumateConfig,
    webhook: webhookConfig,
    development = false,
  } = options;

  // Initialize services
  const hanumate = createHanumateService(hanumateConfig);
  const repoManager = createRepoManager({}, logger);
  const webhookRouter = createWebhookRouter(webhookConfig, logger);

  // Create Probot app
  const app = new Probot({
    appId,
    privateKey,
    secret: webhookSecret,
  });

  // Create handler instances
  const prManagerFactory = (octokit: any) => createPRManager(octokit, {}, logger);
  let prManager = prManagerFactory(null as any); // Placeholder

  const issueHandler = createIssueHandler(hanumate, repoManager, {
    autoReply: true,
  }, logger);

  const prHandler = createPRHandler(hanumate, repoManager, prManager, {
    autoComment: true,
    postSummaryOnSync: true,
  }, logger);

  const labelHandler = createLabelHandler(hanumate, repoManager, prManager, {
    autoRemoveTriggerLabel: false,
  }, logger);

  const mentionHandler = createMentionHandler(hanumate, repoManager, {
    rateLimitPerMinute: 30,
  }, logger);

  const branchHandler = createBranchHandler(hanumate, repoManager, {}, logger);

  const actionsHandler = createActionsHandler(hanumate, repoManager, {
    triggerWorkflows: ['hanumate-dispatch', 'ci', 'test'],
    createTaskOnFailure: true,
  }, logger);

  // Register handlers with router
  webhookRouter.registerHandlers({
    issue: issueHandler,
    pr: prHandler,
    label: labelHandler,
    mention: mentionHandler,
    branch: branchHandler,
    actions: actionsHandler,
  });

  // ============================================
  // Probot Event Handlers
  // ============================================

  // Handle app installation
  app.on('installation.created', async (context) => {
    logger.info(`App installed for account: ${context.payload.installation.account?.login}`);

    // Register all repos for this installation
    const repos = context.payload.repositories || [];
    for (const repo of repos) {
      const repoWithOwner = repo as { owner?: { login?: string }; name?: string };
      if (repoWithOwner.owner?.login && repoWithOwner.name) {
        repoManager.registerRepo(repoWithOwner.owner.login, repoWithOwner.name);
      }
    }
  });

  // Handle app uninstallation
  app.on('installation.deleted', async (context) => {
    logger.info(`App uninstalled for account: ${context.payload.installation.account?.login}`);
    // Clean up repo configurations
  });

  // ============================================
  // Webhook Event Routes
  // ============================================

  // Issues events
  app.on('issues', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    // Update PR manager with current octokit
    prManager = prManagerFactory(context.octokit);

    await webhookRouter.route('issues', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Issue comments
  app.on('issue_comment', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('issue_comment', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Pull request events
  app.on('pull_request', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    prManager = prManagerFactory(context.octokit);

    await webhookRouter.route('pull_request', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // PR reviews
  app.on('pull_request_review', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    prManager = prManagerFactory(context.octokit);

    await webhookRouter.route('pull_request_review', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // PR review comments
  app.on('pull_request_review_comment', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('pull_request_review_comment', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Label events
  app.on('label', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    prManager = prManagerFactory(context.octokit);

    await webhookRouter.route('label', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Check run events
  app.on('check_run', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('check_run', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Check suite events
  app.on('check_suite', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('check_suite', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Push events (for branch triggers)
  app.on('push', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('push', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // Workflow run events
  app.on('workflow_run', async (context) => {
    const payload = context.payload as Parameters<typeof webhookRouter.route>[1];

    await webhookRouter.route('workflow_run', payload, {
      deliveryId: context.id,
      installation: context.payload.installation ? { id: context.payload.installation.id } : undefined,
      repository: context.payload.repository ? { owner: { login: context.payload.repository.owner?.login || '' }, name: context.payload.repository.name } : undefined,
    });
  });

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get Hanumate service instance
   */
  function getHanumateService() {
    return hanumate;
  }

  /**
   * Get repo manager instance
   */
  function getRepoManager() {
    return repoManager;
  }

  /**
   * Get webhook router instance
   */
  function getWebhookRouter() {
    return webhookRouter;
  }

  /**
   * Submit a custom task to Hanumate
   */
  async function submitTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'status'>): Promise<TaskResult> {
    return hanumate.submitTask(task as AgentTask);
  }

  // Return app with utility methods
  return Object.assign(app, {
    getHanumateService,
    getRepoManager,
    getWebhookRouter,
    submitTask,
  });
}

