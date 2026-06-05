/**
 * PR Manager Service
 * Handles PR lifecycle operations and GitHub API interactions
 */

import type { PRManagerService, Logger, OctokitClient } from '../types.js';

export interface PRManagerConfig {
  /** GitHub token or installation token */
  token?: string;
  /** Rate limit delay between comments (ms) */
  commentRateLimit?: number;
  /** Max retry attempts for API calls */
  maxRetries?: number;
}

interface PullRequest {
  draft: boolean;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  assignees?: Array<{ login: string }>;
  requested_reviewers?: Array<{ login: string }>;
}

export class PRManager implements PRManagerService {
  private octokit: OctokitClient;
  private commentRateLimit: number;
  private lastCommentTime: Map<string, number> = new Map();
  private logger: Logger;

  constructor(octokit: OctokitClient, config: PRManagerConfig = {}, logger?: Logger) {
    this.octokit = octokit;
    this.commentRateLimit = config.commentRateLimit || 5000; // 5 second default
    this.logger = logger || console;
  }

  /**
   * Create a comment on a pull request
   */
  async createComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    const key = `${owner}/${repo}/${prNumber}`;

    // Rate limiting
    await this.enforceRateLimit(key);

    try {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      this.lastCommentTime.set(key, Date.now());
      this.logger.info(`Comment created on ${owner}/${repo}#${prNumber}`);
    } catch (error) {
      this.logger.error(`Failed to create comment on ${owner}/${repo}#${prNumber}`, { error });
      throw error;
    }
  }

  /**
   * Update pull request description/body
   */
  async updatePRDescription(owner: string, repo: string, prNumber: number, description: string): Promise<void> {
    try {
      await this.octokit.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        body: description,
      });
      this.logger.info(`Updated PR description for ${owner}/${repo}#${prNumber}`);
    } catch (error) {
      this.logger.error(`Failed to update PR description`, { error });
      throw error;
    }
  }

  /**
   * Add labels to a pull request
   */
  async addLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void> {
    if (labels.length === 0) return;

    try {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels,
      });
      this.logger.info(`Added labels to ${owner}/${repo}#${prNumber}: ${labels.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to add labels`, { error });
      throw error;
    }
  }

  /**
   * Remove labels from a pull request
   */
  async removeLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void> {
    const removePromises = labels.map(label =>
      this.octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: label,
      }).catch(err => {
        this.logger.warn(`Failed to remove label ${label}`, { error: err });
      })
    );

    await Promise.all(removePromises);
    this.logger.info(`Removed labels from ${owner}/${repo}#${prNumber}`);
  }

  /**
   * Request reviewers for a pull request
   */
  async requestReviewers(owner: string, repo: string, prNumber: number, reviewers: string[]): Promise<void> {
    if (reviewers.length === 0) return;

    try {
      await this.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers,
      });
      this.logger.info(`Requested reviewers for ${owner}/${repo}#${prNumber}: ${reviewers.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to request reviewers`, { error });
      throw error;
    }
  }

  /**
   * Get the diff content of a pull request
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    try {
      const response = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: 'diff',
        },
      });

      // The response.data is the diff as a string when using 'diff' format
      return response.data as unknown as string;
    } catch (error) {
      this.logger.error(`Failed to get PR diff`, { error });
      throw error;
    }
  }

  /**
   * Check if a pull request is ready for review
   */
  isReadyForReview(pr: { draft?: boolean; assignees?: unknown[]; requested_reviewers?: unknown[] }): boolean {
    // PR is ready if:
    // - It's not a draft
    // - It has at least one assignee or is explicitly marked ready
    const isNotDraft = !pr.draft;
    const hasAssignees = (pr.assignees?.length ?? 0) > 0;
    // Check if PR has been reviewed
    const hasReviews = (pr.requested_reviewers?.length ?? 0) > 0;

    return isNotDraft && (hasAssignees || hasReviews);
  }

  /**
   * Create a PR summary comment
   */
  async createPRSummary(
    owner: string,
    repo: string,
    prNumber: number,
    summary: {
      additions?: number;
      deletions?: number;
      changedFiles?: number;
      checks?: Array<{ name: string; status: string; url?: string }>;
      comments?: number;
    }
  ): Promise<void> {
    const lines: string[] = [
      '## Pull Request Summary',
      '',
      '| Metric | Value |',
      '|--------|-------|',
    ];

    if (summary.additions !== undefined) {
      lines.push(`| Additions | +${summary.additions} |`);
    }
    if (summary.deletions !== undefined) {
      lines.push(`| Deletions | -${summary.deletions} |`);
    }
    if (summary.changedFiles !== undefined) {
      lines.push(`| Changed Files | ${summary.changedFiles} |`);
    }
    if (summary.comments !== undefined) {
      lines.push(`| Comments | ${summary.comments} |`);
    }

    if (summary.checks?.length) {
      lines.push('', '### Status Checks');
      lines.push('', '| Check | Status |');
      lines.push('', '|-------|--------|');
      for (const check of summary.checks) {
        const statusIcon = check.status === 'success' ? '✅' : check.status === 'failure' ? '❌' : '⏳';
        const urlLink = check.url ? `[${check.name}](${check.url})` : check.name;
        lines.push(`| ${urlLink} | ${statusIcon} ${check.status} |`);
      }
    }

    await this.createComment(owner, repo, prNumber, lines.join('\n'));
  }

  /**
   * Get PR statistics
   */
  async getPRStats(owner: string, repo: string, prNumber: number): Promise<{
    additions: number;
    deletions: number;
    changedFiles: number;
    comments: number;
    commits: number;
  }> {
    const pr = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const commits = await this.octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    const comments = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return {
      additions: pr.data.additions || 0,
      deletions: pr.data.deletions || 0,
      changedFiles: pr.data.changed_files || 0,
      comments: comments.data.filter(c => c.user?.type !== 'Bot').length,
      commits: commits.data.length,
    };
  }

  /**
   * Enforce rate limiting between comments
   */
  private async enforceRateLimit(key: string): Promise<void> {
    const lastTime = this.lastCommentTime.get(key) || 0;
    const elapsed = Date.now() - lastTime;

    if (elapsed < this.commentRateLimit) {
      await new Promise(resolve => setTimeout(resolve, this.commentRateLimit - elapsed));
    }
  }
}

/**
 * Factory function to create PRManager
 */
export function createPRManager(
  octokit: OctokitClient,
  config?: PRManagerConfig,
  logger?: Logger
): PRManager {
  return new PRManager(octokit, config, logger);
}