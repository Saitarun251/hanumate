/**
 * Branch Handler
 * Handles branch-based triggers for GitHub events
 */

import type { Logger } from '../types.js';
import type { RubberDuckService } from '../services/rubberduck.js';
import type { RepoManager } from '../services/repo-manager.js';

export interface BranchHandlerConfig {
  /** Default branch patterns to trigger on */
  defaultPatterns?: string[];
}

export interface BranchEventContext {
  /** Branch name that triggered the event */
  branchName: string;
  /** Full ref (e.g., refs/heads/main) */
  ref: string;
  /** Branch type: heads, tags, etc. */
  refType: 'heads' | 'tags' | 'remote-refs';
  /** SHA of the commit */
  sha: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Installation ID */
  installationId: number;
}

export class BranchHandler {
  private rubberduck: RubberDuckService;
  private _repoManager: RepoManager;
  private _config: BranchHandlerConfig;
  private logger: Logger;

  // Default patterns that trigger actions
  private readonly defaultPatterns: Map<RegExp, { type: string; priority: 'low' | 'normal' | 'high' }> = new Map([
    [/^feat\//i, { type: 'feature', priority: 'normal' }],
    [/^bugfix\//i, { type: 'bugfix', priority: 'high' }],
    [/^hotfix\//i, { type: 'hotfix', priority: 'high' }],
    [/^fix\//i, { type: 'bugfix', priority: 'normal' }],
    [/^refactor\//i, { type: 'refactor', priority: 'low' }],
    [/^docs?\//i, { type: 'documentation', priority: 'low' }],
    [/^test\//i, { type: 'testing', priority: 'low' }],
    [/^chore\//i, { type: 'maintenance', priority: 'low' }],
    [/^release\//i, { type: 'release', priority: 'high' }],
    [/^dependabot\//i, { type: 'dependency', priority: 'normal' }],
  ]);

  constructor(
    rubberduck: RubberDuckService,
    repoManager: RepoManager,
    config: BranchHandlerConfig = {},
    logger?: Logger
  ) {
    this.rubberduck = rubberduck;
    this._repoManager = repoManager;
    this._config = config;
    this.logger = logger || console;
  }

  /**
   * Handle push event (branch created/updated)
   */
  async handlePush(
    payload: {
      ref: string;
      before: string;
      after: string;
      repository: {
        owner: { login: string };
        name: string;
      };
      sender: { login: string; type: string };
      commits?: Array<{
        id: string;
        message: string;
        author: { name: string; email: string };
      }>;
    },
    context: { installationId: number }
  ): Promise<void> {
    const { ref, repository, sender, commits = [] } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    // Only handle branch pushes (not tags)
    if (!ref.startsWith('refs/heads/')) {
      this.logger.debug(`Ignoring non-branch ref: ${ref}`);
      return;
    }

    const branchName = ref.replace('refs/heads/', '');

    // Skip bot pushes
    if (sender.type === 'Bot') {
      this.logger.debug(`Skipping bot push to ${branchName}`);
      return;
    }

    this.logger.info(`Processing branch push: ${owner}/${repo}:${branchName}`);

    // Check if branch matches trigger patterns
    const shouldTrigger = this._repoManager.shouldTrigger(owner, repo, 'branch_pattern', {
      branchName,
      commits,
    });

    if (!shouldTrigger) {
      this.logger.debug(`Branch ${branchName} does not match trigger patterns`);
      return;
    }

    // Determine task type from branch pattern
    const branchInfo = this.classifyBranch(branchName);

    // Create task for branch
    const task = this.rubberduck.createTask({
      type: 'branch',
      trigger: 'branch_pattern',
      owner,
      repo,
      context: { branchName },
      payload: {
        branchName,
        ref,
        sha: payload.after,
        previousSha: payload.before,
        commits,
        branchType: branchInfo.type,
        isNewBranch: payload.before === '0000000000000000000000000000000000000000',
        isDeleted: payload.after === '0000000000000000000000000000000000000000',
      },
      priority: branchInfo.priority,
    });

    await this.rubberduck.submitTask(task);

    // Handle branch lifecycle events
    if (payload.before === '0000000000000000000000000000000000000000') {
      // New branch created
      await this.handleNewBranch(owner, repo, branchName);
    } else if (payload.after === '0000000000000000000000000000000000000000') {
      // Branch deleted
      await this.handleBranchDeleted(owner, repo, branchName);
    }
  }

  /**
   * Handle pull request events with branch info
   */
  async handlePRBranch(
    payload: {
      action: string;
      pull_request: {
        number: number;
        title: string;
        head: { ref: string; sha: string };
        base: { ref: string };
        user: { login: string };
      };
      repository: {
        owner: { login: string };
        name: string;
      };
      sender: { login: string; type: string };
    },
    context: { installationId: number }
  ): Promise<void> {
    const { action, pull_request, repository, sender } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const branchName = pull_request.head.ref;

    if (sender.type === 'Bot') return;

    // Check if branch should trigger
    const shouldTrigger = this._repoManager.shouldTrigger(owner, repo, 'branch_pattern', {
      branchName,
    });

    if (!shouldTrigger) return;

    if (action === 'opened' || action === 'reopened') {
      this.logger.info(`PR opened from trigger branch: ${branchName}`);

      const task = this.rubberduck.createTask({
        type: 'pr',
        trigger: 'branch_pattern',
        owner,
        repo,
        context: {
          prNumber: pull_request.number,
          branchName,
        },
        payload: {
          branchName,
          baseBranch: pull_request.base.ref,
          prTitle: pull_request.title,
          author: pull_request.user.login,
        },
        priority: this.classifyBranch(branchName).priority,
      });

      await this.rubberduck.submitTask(task);
    }
  }

  /**
   * Classify branch type from name
   */
  classifyBranch(branchName: string): { type: string; priority: 'low' | 'normal' | 'high' } {
    // Check custom patterns first
    for (const [pattern, info] of this.defaultPatterns) {
      if (pattern.test(branchName)) {
        return info;
      }
    }

    // Default classification
    return { type: 'general', priority: 'normal' };
  }

  /**
   * Handle new branch creation
   */
  private async handleNewBranch(_owner: string, _repo: string, branchName: string): Promise<void> {
    this.logger.info(`New branch created: ${branchName}`);
  }

  /**
   * Handle branch deletion
   */
  private async handleBranchDeleted(_owner: string, _repo: string, branchName: string): Promise<void> {
    this.logger.info(`Branch deleted: ${branchName}`);
  }

  /**
   * Check if branch matches a specific pattern
   */
  matchesPattern(branchName: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(branchName);
    }

    // Glob pattern matching
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}$`).test(branchName);
    }

    // Exact or prefix match
    return branchName === pattern || branchName.startsWith(pattern);
  }

  /**
   * Extract conventional commit info from branch name
   */
  parseConventionalBranch(branchName: string): {
    type: string;
    scope?: string;
    description: string;
    isBreaking: boolean;
  } | null {
    // Match patterns like: feat(scope):description or feat:description
    const match = branchName.match(/^([a-z]+)(?:\(([^)]+)\))?(?::|\/)(.+)$/i);
    if (!match) return null;

    return {
      type: match[1].toLowerCase(),
      scope: match[2],
      description: match[3],
      isBreaking: match[3].includes('!') || branchName.includes('breaking'),
    };
  }
}

/**
 * Factory function to create BranchHandler
 */
export function createBranchHandler(
  rubberduck: RubberDuckService,
  repoManager: RepoManager,
  config?: BranchHandlerConfig,
  logger?: Logger
): BranchHandler {
  return new BranchHandler(rubberduck, repoManager, config, logger);
}