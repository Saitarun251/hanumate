/**
 * Webhook Event Router
 * Routes incoming webhook events to appropriate handlers
 */

import type { Logger } from './types.js';
import type { IssueHandler } from './handlers/issue.js';
import type { PRHandler } from './handlers/pr.js';
import type { LabelHandler } from './handlers/label.js';
import type { MentionHandler } from './handlers/mention.js';
import type { BranchHandler } from './handlers/branch.js';
import type { ActionsHandler } from './handlers/actions.js';

export interface WebhookRouterConfig {
  /** Enable all events */
  enableAll?: boolean;
  /** Specific events to handle */
  events?: string[];
  /** Event handlers to skip */
  skipHandlers?: string[];
}

export class WebhookRouter {
  private issueHandler: IssueHandler | null = null;
  private prHandler: PRHandler | null = null;
  private labelHandler: LabelHandler | null = null;
  private mentionHandler: MentionHandler | null = null;
  private branchHandler: BranchHandler | null = null;
  private actionsHandler: ActionsHandler | null = null;
  private config: WebhookRouterConfig;
  private logger: Logger;

  // Supported events
  private readonly supportedEvents = [
    'issues',
    'issue_comment',
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
    'label',
    'check_run',
    'check_suite',
    'push',
    'workflow_run',
    'workflow_job',
  ];

  constructor(config: WebhookRouterConfig = {}, logger?: Logger) {
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Register handler instances
   */
  registerHandlers(handlers: {
    issue?: IssueHandler;
    pr?: PRHandler;
    label?: LabelHandler;
    mention?: MentionHandler;
    branch?: BranchHandler;
    actions?: ActionsHandler;
  }): void {
    this.issueHandler = handlers.issue || null;
    this.prHandler = handlers.pr || null;
    this.labelHandler = handlers.label || null;
    this.mentionHandler = handlers.mention || null;
    this.branchHandler = handlers.branch || null;
    this.actionsHandler = handlers.actions || null;
  }

  /**
   * Route webhook event to appropriate handler
   */
  async route(
    event: string,
    payload: unknown,
    context: {
      deliveryId: string;
      installation?: { id: number; account?: { login: string } };
      repository?: { owner: { login: string }; name: string };
    }
  ): Promise<void> {
    // Validate event
    if (!this.supportedEvents.includes(event)) {
      this.logger.debug(`Unsupported event: ${event}`);
      return;
    }

    const ctx = {
      owner: context.repository?.owner?.login || '',
      repo: context.repository?.name || '',
      installationId: context.installation?.id || 0,
    };

    this.logger.info(`Routing webhook: ${event} (delivery: ${context.deliveryId})`);

    try {
      switch (event) {
        case 'issues':
          if (this.issueHandler) {
            await this.issueHandler.handle(payload as Parameters<typeof this.issueHandler.handle>[0], ctx);
          }
          break;

        case 'issue_comment':
          if (this.mentionHandler) {
            await this.mentionHandler.handleIssueComment(payload as any, ctx);
          }
          break;

        case 'pull_request':
          if (this.prHandler) {
            await this.prHandler.handle(payload as any, ctx);
          }
          break;

        case 'pull_request_review':
          if (this.prHandler) {
            await this.prHandler.handleReview(payload as any, ctx);
          }
          break;

        case 'pull_request_review_comment':
          if (this.mentionHandler) {
            await this.mentionHandler.handleReviewComment(payload as any, ctx);
          }
          break;

        case 'label':
          if (this.labelHandler) {
            await this.labelHandler.handle(payload as any, ctx);
          }
          break;

        case 'check_run':
          if (this.actionsHandler) {
            await this.actionsHandler.handleCheckRun(payload as any, ctx);
          }
          break;

        case 'check_suite':
          if (this.actionsHandler) {
            await this.actionsHandler.handleCheckSuite(payload as any, ctx);
          }
          break;

        case 'push':
          if (this.branchHandler) {
            await this.branchHandler.handlePush(payload as any, { installationId: ctx.installationId });
          }
          break;

        case 'workflow_run':
          if (this.actionsHandler) {
            await this.actionsHandler.handleWorkflowRun(payload as any, { installationId: ctx.installationId });
          }
          break;

        case 'workflow_job':
          if (this.actionsHandler) {
            await this.actionsHandler.handleWorkflowJob(payload as any, { installationId: ctx.installationId });
          }
          break;

        default:
          this.logger.debug(`No handler for event: ${event}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Webhook routing failed for ${event}: ${err.message}`, {
        deliveryId: context.deliveryId,
        repository: context.repository?.owner?.login,
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Get list of supported events
   */
  getSupportedEvents(): string[] {
    return [...this.supportedEvents];
  }
}

/**
 * Factory function to create WebhookRouter
 */
export function createWebhookRouter(
  config?: WebhookRouterConfig,
  logger?: Logger
): WebhookRouter {
  return new WebhookRouter(config, logger);
}