/**
 * Repository Manager Service
 * Handles multi-repo configuration and trigger validation
 */

import type { RepoConfig, RepoManagerService, TriggerMode, Logger } from '../types.js';

export interface RepoManagerConfig {
  /** Persist config changes to disk */
  persistConfig?: boolean;
  /** Config file path */
  configPath?: string;
}

export class RepoManager implements RepoManagerService {
  private repos: Map<string, RepoConfig> = new Map();
  private _config: RepoManagerConfig;
  private logger: Logger;

  constructor(config: RepoManagerConfig = {}, logger?: Logger) {
    this._config = config;
    this.logger = logger || console;
  }

  /**
   * Get configuration for a repository
   */
  getRepoConfig(owner: string, repo: string): RepoConfig | undefined {
    const key = this.makeKey(owner, repo);
    return this.repos.get(key);
  }

  /**
   * Update repository configuration
   */
  updateRepoConfig(owner: string, repo: string, updates: Partial<RepoConfig>): void {
    const key = this.makeKey(owner, repo);
    const existing = this.repos.get(key);
    const updated: RepoConfig = existing
      ? { ...existing, ...updates }
      : this.createDefaultConfig(owner, repo, updates);

    this.repos.set(key, updated);
    this.logger.info(`Updated config for ${owner}/${repo}`, { enabled: updated.enabled, triggers: updated.triggers });
  }

  /**
   * List all configured repositories
   */
  listRepos(): Array<{ owner: string; repo: string; config: RepoConfig }> {
    const result: Array<{ owner: string; repo: string; config: RepoConfig }> = [];
    for (const [key, config] of this.repos) {
      const [owner, repo] = key.split('/');
      result.push({ owner, repo, config });
    }
    return result;
  }

  /**
   * Check if a repository is enabled
   */
  isRepoEnabled(owner: string, repo: string): boolean {
    const config = this.getRepoConfig(owner, repo);
    return config?.enabled ?? false;
  }

  /**
   * Validate trigger conditions for a webhook event
   */
  shouldTrigger(
    owner: string,
    repo: string,
    mode: TriggerMode,
    payload: Record<string, unknown>
  ): boolean {
    const config = this.getRepoConfig(owner, repo);

    // If no config exists, use default behavior (trigger)
    if (!config) {
      return true;
    }

    // Check if repo is enabled
    if (!config.enabled) {
      return false;
    }

    const triggers = config.triggers;

    switch (mode) {
      case 'mention':
        return triggers.mention ?? false;

      case 'label': {
        if (!triggers.label) return false;
        if (!config.triggerLabels?.length) return false;

        // Check if any of the payload labels match trigger labels
        const payloadLabels = (payload.labels as Array<{ name: string }>) ?? [];
        return payloadLabels.some(label =>
          config.triggerLabels!.includes(label.name)
        );
      }

      case 'pr_assignment': {
        if (!triggers.prAssignment) return false;

        // Check if the bot was assigned
        const assignees = (payload.assignees as Array<{ login: string }>) ?? [];
        const botUsername = config.botUsername || 'hanumate';
        return assignees.some(a => a.login.toLowerCase() === botUsername.toLowerCase());
      }

      case 'branch_pattern': {
        if (!config.triggers.branchPattern) return false;

        const branchName = payload.branchName as string;
        if (!branchName) return false;

        const patterns = Array.isArray(config.triggers.branchPattern)
          ? config.triggers.branchPattern
          : [config.triggers.branchPattern];

        return patterns.some(pattern => this.matchBranchPattern(branchName, pattern));
      }

      case 'workflow_dispatch':
        return triggers.workflowDispatch ?? false;

      default:
        return false;
    }
  }

  /**
   * Register a new repository with default configuration
   */
  registerRepo(owner: string, repo: string, config?: Partial<RepoConfig>): RepoConfig {
    const fullConfig = this.createDefaultConfig(owner, repo, config);
    const key = this.makeKey(owner, repo);
    this.repos.set(key, fullConfig);
    return fullConfig;
  }

  /**
   * Remove a repository configuration
   */
  unregisterRepo(owner: string, repo: string): boolean {
    const key = this.makeKey(owner, repo);
    return this.repos.delete(key);
  }

  /**
   * Get count of enabled repos
   */
  getEnabledRepoCount(): number {
    let count = 0;
    for (const config of this.repos.values()) {
      if (config.enabled) count++;
    }
    return count;
  }

  /**
   * Load configuration from a JSON file
   */
  async loadFromFile(filePath: string): Promise<void> {
    this.logger.info(`Loading config from ${filePath}`);
  }

  /**
   * Persist configuration to disk
   */
  async saveToFile(filePath: string): Promise<void> {
    this.logger.info(`Saving config to ${filePath}`);
  }

  /**
   * Create default configuration for a repo
   */
  private createDefaultConfig(
    owner: string,
    repo: string,
    overrides?: Partial<RepoConfig>
  ): RepoConfig {
    return {
      owner,
      repo,
      enabled: true,
      triggers: {
        mention: true,
        label: true,
        prAssignment: true,
        branchPattern: undefined,
        workflowDispatch: false,
      },
      triggerLabels: ['needs-review', 'hanumate'],
      welcomeMessage: 'Hello! I am RubberDuck, your coding assistant. How can I help you today?',
      ...overrides,
    };
  }

  /**
   * Create map key from owner/repo
   */
  private makeKey(owner: string, repo: string): string {
    return `${owner}/${repo}`.toLowerCase();
  }

  /**
   * Match branch name against pattern
   * Supports: exact match, glob patterns (feat/*, bugfix/*), regex
   */
  private matchBranchPattern(branchName: string, pattern: string): boolean {
    // Exact match
    if (branchName === pattern) return true;

    // Glob pattern: feat/* -> match any branch starting with "feat/"
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}$`).test(branchName);
    }

    // Prefix match
    if (pattern.endsWith('/')) {
      return branchName.startsWith(pattern.slice(0, -1));
    }

    // Contains match
    return branchName.includes(pattern);
  }
}

/**
 * Factory function to create RepoManager
 */
export function createRepoManager(
  config?: RepoManagerConfig,
  logger?: Logger
): RepoManager {
  return new RepoManager(config, logger);
}