/**
 * Issue Event Handler
 * Handles issue-related webhook events
 */

import type { Logger } from '../types.js';
import type { HanumateService } from '../services/hanumate.js';
import type { RepoManager } from '../services/repo-manager.js';

export interface IssueHandlerConfig {
  /** Auto-reply to new issues */
  autoReply?: boolean;
  /** Welcome message template */
  welcomeMessage?: string;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  user: { login: string; id: number; type: string };
  labels: Array<{ name: string; color: string }>;
}

interface IssuePayload {
  action: string;
  issue: Issue;
  label?: { name: string; color: string };
  assignee?: { login: string; id: number };
  sender: { login: string; type: string };
}

export class IssueHandler {
  private hanumate: HanumateService;
  private repoManager: RepoManager;
  private config: IssueHandlerConfig;
  private logger: Logger;

  constructor(
    hanumate: HanumateService,
    repoManager: RepoManager,
    config: IssueHandlerConfig = {},
    logger?: Logger
  ) {
    this.hanumate = hanumate;
    this.repoManager = repoManager;
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Handle issue event
   */
  async handle(
    payload: IssuePayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, issue, sender } = payload;
    const { owner, repo } = context;

    // Skip bot-originated events
    if (sender.type === 'Bot') {
      this.logger.debug(`Skipping bot-originated issue event: ${action}`);
      return;
    }

    this.logger.info(`Processing issue event: ${action} on ${owner}/${repo}#${issue.number}`);

    switch (action) {
      case 'opened':
        await this.handleIssueOpened(owner, repo, issue, context.installationId);
        break;
      case 'labeled':
        await this.handleIssueLabeled(owner, repo, issue, payload.label, context.installationId);
        break;
      case 'assigned':
        await this.handleIssueAssigned(owner, repo, issue, payload.assignee, context.installationId);
        break;
      case 'reopened':
        await this.handleIssueReopened(owner, repo, issue, context.installationId);
        break;
      default:
        this.logger.debug(`Unhandled issue action: ${action}`);
    }
  }

  /**
   * Handle new issue opened
   */
  private async handleIssueOpened(
    owner: string,
    repo: string,
    issue: Issue,
    _installationId: number
  ): Promise<void> {
    // Auto-reply with welcome message
    if (this.config.autoReply) {
      const config = this.repoManager.getRepoConfig(owner, repo);
      const message = config?.welcomeMessage || this.config.welcomeMessage || this.getDefaultWelcome();
      await this.postComment(owner, repo, issue.number, this.formatWelcome(message, issue));
    }
  }

  /**
   * Handle issue labeled
   */
  private async handleIssueLabeled(
    owner: string,
    repo: string,
    issue: Issue,
    label: { name: string; color: string } | undefined,
    _installationId: number
  ): Promise<void> {
    if (!label) return;

    // Check if this is a trigger label
    const shouldTrigger = this.repoManager.shouldTrigger(owner, repo, 'label', {
      labels: issue.labels,
    });

    if (shouldTrigger) {
      this.logger.info(`Triggering on label: ${label.name}`);

      const task = this.hanumate.createTask({
        type: 'issue',
        trigger: 'label',
        owner,
        repo,
        context: { issueNumber: issue.number },
        payload: {
          action: 'labeled',
          issue,
          label,
        },
        priority: this.isHighPriorityLabel(label.name) ? 'high' : 'normal',
      });

      await this.hanumate.submitTask(task);
    }
  }

  /**
   * Handle issue assigned
   */
  private async handleIssueAssigned(
    owner: string,
    repo: string,
    issue: Issue,
    assignee: { login: string; id: number } | undefined,
    _installationId: number
  ): Promise<void> {
    if (!assignee) return;

    // Check if it's assigned to a known bot user
    const config = this.repoManager.getRepoConfig(owner, repo);
    const botUsername = config?.botUsername || 'hanumate';

    if (assignee.login.toLowerCase() === botUsername.toLowerCase()) {
      this.logger.info(`Issue assigned to bot: ${owner}/${repo}#${issue.number}`);

      const task = this.hanumate.createTask({
        type: 'issue',
        trigger: 'pr_assignment',
        owner,
        repo,
        context: { issueNumber: issue.number },
        payload: { issue, assignee },
        priority: 'normal',
      });

      await this.hanumate.submitTask(task);
    }
  }

  /**
   * Handle issue reopened
   */
  private async handleIssueReopened(
    owner: string,
    repo: string,
    issue: Issue,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`Issue reopened: ${owner}/${repo}#${issue.number}`);

    const task = this.hanumate.createTask({
      type: 'issue',
      trigger: 'label',
      owner,
      repo,
      context: { issueNumber: issue.number },
      payload: { action: 'reopened', issue },
      priority: 'normal',
    });

    await this.hanumate.submitTask(task);
  }

  /**
   * Post a comment on an issue/PR
   */
  private async postComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    // This would be implemented via octokit in the main app
    this.logger.info(`Would post comment to ${owner}/${repo}#${issueNumber}: ${body.substring(0, 50)}...`);
  }

  /**
   * Format welcome message
   */
  private formatWelcome(message: string, issue: Issue): string {
    return message
      .replace(/\{\{issue_number\}\}/g, `#${issue.number}`)
      .replace(/\{\{title\}\}/g, issue.title)
      .replace(/\{\{author\}\}/g, issue.user.login);
  }

  /**
   * Get default welcome message
   */
  private getDefaultWelcome(): string {
    return `Hello! I'm here to help with your coding questions and tasks.

To get started:
- Describe what you're trying to accomplish
- Share relevant code or error messages
- Mention @hanumate if you need immediate attention

I'll respond as soon as I can!`;
  }

  /**
   * Check if label indicates high priority
   */
  private isHighPriorityLabel(labelName: string): boolean {
    const highPriorityLabels = ['urgent', 'critical', 'bug', 'security', 'p0', 'p1'];
    return highPriorityLabels.some(p => labelName.toLowerCase().includes(p));
  }
}

/**
 * Factory function to create IssueHandler
 */
export function createIssueHandler(
  hanumate: HanumateService,
  repoManager: RepoManager,
  config?: IssueHandlerConfig,
  logger?: Logger
): IssueHandler {
  return new IssueHandler(hanumate, repoManager, config, logger);
}