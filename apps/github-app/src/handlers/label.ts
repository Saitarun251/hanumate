/**
 * Label Event Handler
 * Handles label-added and label-removed webhook events
 */

import type { Logger } from '../types.js';
import type { RubberDuckService } from '../services/rubberduck.js';
import type { RepoManager } from '../services/repo-manager.js';
import type { PRManager } from '../services/pr-manager.js';

export interface LabelHandlerConfig {
  /** Labels that trigger code review */
  reviewLabels?: string[];
  /** Labels that trigger bug fix */
  bugLabels?: string[];
  /** Labels that trigger documentation */
  docsLabels?: string[];
  /** Auto-remove trigger labels after processing */
  autoRemoveTriggerLabel?: boolean;
}

interface LabelEventPayload {
  action: 'added' | 'removed';
  label?: { name: string; color: string };
  repository?: { full_name: string };
  sender?: { login: string; id: number };
}

export class LabelHandler {
  private rubberduck: RubberDuckService;
  private repoManager: RepoManager;
  private prManager: PRManager;
  private config: LabelHandlerConfig;
  private logger: Logger;

  constructor(
    rubberduck: RubberDuckService,
    repoManager: RepoManager,
    prManager: PRManager,
    config: LabelHandlerConfig = {},
    logger?: Logger
  ) {
    this.rubberduck = rubberduck;
    this.repoManager = repoManager;
    this.prManager = prManager;
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Handle label event
   */
  async handle(
    payload: unknown,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const p = payload as LabelEventPayload;
    const action = p.action;
    const label = p.label;
    const repository = p.repository;

    // Skip if no label
    if (!label) {
      this.logger.debug('No label in payload, skipping');
      return;
    }

    this.logger.info(`Processing label event: ${action} on ${context.owner}/${context.repo} - label: ${label.name}`);

    if (action === 'added') {
      await this.handleLabelAdded(context.owner, context.repo, label.name, label.color || '', repository?.full_name || `${context.owner}/${context.repo}`, context.installationId);
    } else if (action === 'removed') {
      await this.handleLabelRemoved(context.owner, context.repo, label.name, repository?.full_name || `${context.owner}/${context.repo}`);
    }
  }

  /**
   * Handle label added
   */
  private async handleLabelAdded(
    owner: string,
    repo: string,
    labelName: string,
    labelColor: string,
    repositoryFullName: string,
    _installationId: number
  ): Promise<void> {
    const config = this.repoManager.getRepoConfig(owner, repo);

    // Check if this is a configured trigger label
    const triggerLabels = config?.triggerLabels || [];
    const isTriggerLabel = triggerLabels.includes(labelName) ||
                           this.isDefaultTriggerLabel(labelName);

    if (!isTriggerLabel) {
      this.logger.debug(`Label ${labelName} is not a trigger label`);
      return;
    }

    // Determine task type based on label
    const taskType = this.determineTaskType(labelName);

    this.logger.info(`Trigger label detected: ${labelName}, creating ${taskType} task`);

    // Create task based on whether this is an issue or PR
    const task = this.rubberduck.createTask({
      type: taskType,
      trigger: 'label',
      owner,
      repo,
      context: {
        issueNumber: 0,
      },
      payload: {
        labelName,
        labelColor,
        isTriggerLabel: true,
        repository: repositoryFullName,
      },
      priority: this.getPriorityFromLabel(labelName),
    });

    const result = await this.rubberduck.submitTask(task);

    // Auto-remove trigger label if configured
    if (this.config.autoRemoveTriggerLabel && result.success) {
      this.logger.debug(`Would remove trigger label ${labelName}`);
    }
  }

  /**
   * Handle label removed
   */
  private async handleLabelRemoved(
    _owner: string,
    _repo: string,
    labelName: string,
    repositoryFullName: string
  ): Promise<void> {
    // Log label removal for tracking
    this.logger.info(`Label removed: ${labelName} from ${repositoryFullName}`);

    // Could trigger cancellation of related tasks if needed
    if (this.isDefaultTriggerLabel(labelName)) {
      this.logger.debug(`Trigger label removed: ${labelName}`);
    }
  }

  /**
   * Determine task type from label name
   */
  private determineTaskType(labelName: string): 'issue' | 'pr' | 'review' | 'comment' {
    const name = labelName.toLowerCase();

    if (name.includes('review') || name.includes('needs-review') || name.includes('rfr')) {
      return 'review';
    }
    if (name.includes('pr') || name.includes('pull')) {
      return 'pr';
    }
    if (name.includes('docs') || name.includes('documentation')) {
      return 'comment';
    }
    return 'issue';
  }

  /**
   * Get priority from label
   */
  private getPriorityFromLabel(labelName: string): 'low' | 'normal' | 'high' {
    const name = labelName.toLowerCase();

    if (name.includes('urgent') || name.includes('critical') || name.includes('p0') || name.includes('hotfix')) {
      return 'high';
    }
    if (name.includes('low-priority') || name.includes('nice-to-have') || name.includes('p3')) {
      return 'low';
    }
    return 'normal';
  }

  /**
   * Check if label is a default trigger label
   */
  private isDefaultTriggerLabel(labelName: string): boolean {
    const defaultTriggers = [
      'rubberduck',
      'needs-review',
      'needs-help',
      'help-wanted',
      'good-first-issue',
      'hacktoberfest',
    ];
    return defaultTriggers.some(t => labelName.toLowerCase().includes(t));
  }
}

/**
 * Factory function to create LabelHandler
 */
export function createLabelHandler(
  rubberduck: RubberDuckService,
  repoManager: RepoManager,
  prManager: PRManager,
  config?: LabelHandlerConfig,
  logger?: Logger
): LabelHandler {
  return new LabelHandler(rubberduck, repoManager, prManager, config, logger);
}