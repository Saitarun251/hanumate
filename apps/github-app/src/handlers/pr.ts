/**
 * Pull Request Event Handler
 * Handles PR-related webhook events
 */

import type { Logger, PREventPayload, PRReviewPayload } from '../types.js';
import type { HanumateService } from '../services/hanumate.js';
import type { RepoManager } from '../services/repo-manager.js';
import type { PRManager } from '../services/pr-manager.js';

export interface PRHandlerConfig {
  /** Auto-comment on new PRs */
  autoComment?: boolean;
  /** Request review from bot when PR is ready */
  autoReviewRequest?: boolean;
  /** Post summary when PR is updated */
  postSummaryOnSync?: boolean;
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  commits?: number;
  head: { ref: string; sha: string };
  base: { ref: string };
  user: { login: string; id: number; type: string };
  assignees: Array<{ login: string; id: number }>;
  requested_reviewers: Array<{ login: string }>;
  labels: Array<{ name: string; color: string }>;
  merged?: boolean;
}

interface PRReview {
  id: number;
  body: string | null;
  state: string;
  user: { login: string; id: number; type: string };
}

export class PRHandler {
  private hanumate: HanumateService;
  private repoManager: RepoManager;
  private prManager: PRManager;
  private config: PRHandlerConfig;
  private logger: Logger;

  constructor(
    hanumate: HanumateService,
    repoManager: RepoManager,
    prManager: PRManager,
    config: PRHandlerConfig = {},
    logger?: Logger
  ) {
    this.hanumate = hanumate;
    this.repoManager = repoManager;
    this.prManager = prManager;
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Handle pull request event
   */
  async handle(
    payload: PREventPayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, pull_request, sender } = payload;
    const { owner, repo } = context;

    // Skip bot-originated events
    if ((sender as { type?: string }).type === 'Bot') {
      this.logger.debug(`Skipping bot-originated PR event: ${action}`);
      return;
    }

    this.logger.info(`Processing PR event: ${action} on ${owner}/${repo}#${pull_request.number}`);

    switch (action) {
      case 'opened':
        await this.handlePROpened(owner, repo, pull_request as unknown as PullRequest, context.installationId);
        break;
      case 'reopened':
        await this.handlePRReopened(owner, repo, pull_request as unknown as PullRequest, context.installationId);
        break;
      case 'synchronize':
        await this.handlePRSynchronize(owner, repo, pull_request as unknown as PullRequest, context.installationId);
        break;
      case 'ready_for_review':
        await this.handlePRReadyForReview(owner, repo, pull_request as unknown as PullRequest, context.installationId);
        break;
      case 'converted_to_draft':
        await this.handlePRConvertedToDraft(owner, repo, pull_request as unknown as PullRequest);
        break;
      case 'closed':
        await this.handlePRClosed(owner, repo, pull_request as unknown as PullRequest);
        break;
      default:
        this.logger.debug(`Unhandled PR action: ${action}`);
    }
  }

  /**
   * Handle PR review event
   */
  async handleReview(
    payload: PRReviewPayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, review, pull_request, sender } = payload;

    if ((sender as { type?: string }).type === 'Bot') return;

    this.logger.info(`Processing PR review event: ${action} on ${context.owner}/${context.repo}#${pull_request.number}`);

    if (action === 'submitted' && review.state === 'changes_requested') {
      await this.handleChangesRequested(context.owner, context.repo, pull_request as unknown as PullRequest, review as unknown as PRReview, context.installationId);
    } else if (action === 'submitted' && review.state === 'approved') {
      await this.handlePRApproved(context.owner, context.repo, pull_request as unknown as PullRequest, review as unknown as PRReview, context.installationId);
    }
  }

  /**
   * Handle new PR opened
   */
  private async handlePROpened(
    owner: string,
    repo: string,
    pr: PullRequest,
    _installationId: number
  ): Promise<void> {
    const config = this.repoManager.getRepoConfig(owner, repo);

    // Create task for new PR
    const task = this.hanumate.createTask({
      type: 'pr',
      trigger: 'label',
      owner,
      repo,
      context: { prNumber: pr.number },
      payload: {
        action: 'opened',
        pr,
        branch: pr.head.ref,
        base: pr.base.ref,
      },
      priority: this.getPriorityFromLabels(pr.labels),
    });

    const result = await this.hanumate.submitTask(task);

    // Auto-comment if enabled
    if (this.config.autoComment && result.success) {
      const comment = this.hanumate.buildTaskSummary(result, { ...task, createdAt: new Date() } as any);
      await this.prManager.createComment(owner, repo, pr.number, comment);
    }

    // Auto-request review if enabled
    if (this.config.autoReviewRequest) {
      const botUsername = config?.botUsername || 'hanumate';
      await this.prManager.requestReviewers(owner, repo, pr.number, [botUsername]);
    }
  }

  /**
   * Handle PR reopened
   */
  private async handlePRReopened(
    owner: string,
    repo: string,
    pr: PullRequest,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`PR reopened: ${owner}/${repo}#${pr.number}`);

    const task = this.hanumate.createTask({
      type: 'pr',
      trigger: 'label',
      owner,
      repo,
      context: { prNumber: pr.number },
      payload: { action: 'reopened', pr },
    });

    await this.hanumate.submitTask(task);
  }

  /**
   * Handle PR synchronize (new commits pushed)
   */
  private async handlePRSynchronize(
    owner: string,
    repo: string,
    pr: PullRequest,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`PR updated: ${owner}/${repo}#${pr.number}`);

    const task = this.hanumate.createTask({
      type: 'pr',
      trigger: 'label',
      owner,
      repo,
      context: { prNumber: pr.number },
      payload: {
        action: 'synchronize',
        pr,
        commits: pr.commits,
        additions: pr.additions,
        deletions: pr.deletions,
      },
    });

    const _result = await this.hanumate.submitTask(task);

    // Post summary on sync if enabled
    if (this.config.postSummaryOnSync && pr.additions !== undefined && pr.deletions !== undefined) {
      await this.prManager.createPRSummary(owner, repo, pr.number, {
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
      });
    }
  }

  /**
   * Handle PR ready for review
   */
  private async handlePRReadyForReview(
    owner: string,
    repo: string,
    pr: PullRequest,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`PR ready for review: ${owner}/${repo}#${pr.number}`);

    const task = this.hanumate.createTask({
      type: 'review',
      trigger: 'label',
      owner,
      repo,
      context: { prNumber: pr.number },
      payload: {
        action: 'ready_for_review',
        pr,
        isDraft: false,
      },
      priority: 'high',
    });

    await this.hanumate.submitTask(task);

    // Add review label
    await this.prManager.addLabels(owner, repo, pr.number, ['in-review']);
  }

  /**
   * Handle PR converted to draft
   */
  private async handlePRConvertedToDraft(owner: string, repo: string, pr: PullRequest): Promise<void> {
    this.logger.info(`PR converted to draft: ${owner}/${repo}#${pr.number}`);

    // Remove in-review label if present
    await this.prManager.removeLabels(owner, repo, pr.number, ['in-review']);
    await this.prManager.addLabels(owner, repo, pr.number, ['draft']);
  }

  /**
   * Handle PR closed
   */
  private async handlePRClosed(owner: string, repo: string, pr: PullRequest): Promise<void> {
    const merged = pr.merged;

    this.logger.info(`PR closed: ${owner}/${repo}#${pr.number}, merged: ${merged}`);

    if (merged) {
      // Add merged label
      await this.prManager.addLabels(owner, repo, pr.number, ['merged']);
    } else {
      // PR was closed without merging
      await this.prManager.addLabels(owner, repo, pr.number, ['closed']);
    }

    // Clean up in-review label
    await this.prManager.removeLabels(owner, repo, pr.number, ['in-review']);
  }

  /**
   * Handle changes requested review
   */
  private async handleChangesRequested(
    owner: string,
    repo: string,
    pr: PullRequest,
    _review: PRReview,
    _installationId: number
  ): Promise<void> {
    const task = this.hanumate.createTask({
      type: 'pr',
      trigger: 'label',
      owner,
      repo,
      context: { prNumber: pr.number },
      payload: {
        action: 'changes_requested',
        pr,
        comment: _review.body,
      },
      priority: 'high',
    });

    await this.hanumate.submitTask(task);

    // Add label indicating changes needed
    await this.prManager.addLabels(owner, repo, pr.number, ['changes-requested']);
  }

  /**
   * Handle PR approved
   */
  private async handlePRApproved(
    owner: string,
    repo: string,
    pr: PullRequest,
    _review: PRReview,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`PR approved: ${owner}/${repo}#${pr.number}`);

    // Add approved label
    await this.prManager.addLabels(owner, repo, pr.number, ['approved']);
    await this.prManager.removeLabels(owner, repo, pr.number, ['changes-requested']);
  }

  /**
   * Get priority from PR labels
   */
  private getPriorityFromLabels(labels: Array<{ name: string }> | undefined): 'low' | 'normal' | 'high' {
    if (!labels) return 'normal';

    const labelNames = labels.map(l => l.name.toLowerCase());
    if (labelNames.some(l => l.includes('urgent') || l.includes('critical') || l.includes('hotfix'))) {
      return 'high';
    }
    if (labelNames.some(l => l.includes('low-priority') || l.includes('nice-to-have'))) {
      return 'low';
    }
    return 'normal';
  }
}

/**
 * Factory function to create PRHandler
 */
export function createPRHandler(
  hanumate: HanumateService,
  repoManager: RepoManager,
  prManager: PRManager,
  config?: PRHandlerConfig,
  logger?: Logger
): PRHandler {
  return new PRHandler(hanumate, repoManager, prManager, config, logger);
}