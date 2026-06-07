/**
 * GitHub Actions Handler
 * Handles workflow dispatch and check run events
 */

import type { Logger } from '../types.js';
import type { CheckRunPayload, CheckSuitePayload } from '../types.js';
import type { HanumateService } from '../services/hanumate.js';
import type { RepoManager } from '../services/repo-manager.js';

export interface ActionsHandlerConfig {
  /** Workflow names that trigger the bot */
  triggerWorkflows?: string[];
  /** Auto-comment on check run completion */
  autoCommentOnCompletion?: boolean;
  /** Create tasks for failed checks */
  createTaskOnFailure?: boolean;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  check_suite?: { id: number };
  html_url: string;
}

interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  run_id: number;
  run_url: string;
  workflow_name: string;
  head_branch: string;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  head_branch: string;
  head_sha: string;
}

export class ActionsHandler {
  private hanumate: HanumateService;
  private _repoManager: RepoManager;
  private config: ActionsHandlerConfig;
  private logger: Logger;

  constructor(
    hanumate: HanumateService,
    repoManager: RepoManager,
    config: ActionsHandlerConfig = {},
    logger?: Logger
  ) {
    this.hanumate = hanumate;
    this._repoManager = repoManager;
    this.config = {
      triggerWorkflows: ['hanumate-dispatch', 'ci', 'test', 'review'],
      autoCommentOnCompletion: true,
      createTaskOnFailure: true,
      ...config,
    };
    this.logger = logger || console;
  }

  /**
   * Handle workflow job event (GitHub Actions)
   */
  async handleWorkflowJob(
    payload: {
      action: string;
      workflow_job: WorkflowJob;
      repository: {
        owner: { login: string };
        name: string;
      };
    },
    context: { installationId: number }
  ): Promise<void> {
    const { action, workflow_job, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    // Only handle specific workflow triggers
    const shouldTrigger = this.isTriggerWorkflow(workflow_job.workflow_name);

    if (!shouldTrigger) {
      this.logger.debug(`Skipping non-trigger workflow: ${workflow_job.workflow_name}`);
      return;
    }

    this.logger.info(`Processing workflow job: ${workflow_job.name} (${action}) on ${owner}/${repo}`);

    switch (action) {
      case 'completed':
        await this.handleJobCompleted(owner, repo, workflow_job, context.installationId);
        break;
      case 'in_progress':
        await this.handleJobStarted(owner, repo, workflow_job);
        break;
      default:
        this.logger.debug(`Unhandled workflow job action: ${action}`);
    }
  }

  /**
   * Handle workflow run event
   */
  async handleWorkflowRun(
    payload: {
      action: string;
      workflow_run: WorkflowRun;
      repository: {
        owner: { login: string };
        name: string;
      };
    },
    context: { installationId: number }
  ): Promise<void> {
    const { action, workflow_run, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    if (action === 'completed') {
      await this.handleWorkflowCompleted(owner, repo, workflow_run, context.installationId);
    }
  }

  /**
   * Handle check run event
   */
  async handleCheckRun(
    payload: CheckRunPayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, check_run, repository } = payload;
    const owner = context.owner;
    const repo = context.repo;

    this.logger.info(`Processing check run: ${check_run.name} (${action}) on ${owner}/${repo}`);

    switch (action) {
      case 'created':
        await this.handleCheckCreated(owner, repo, check_run as unknown as CheckRun, context.installationId);
        break;
      case 'completed':
        await this.handleCheckCompleted(owner, repo, check_run as unknown as CheckRun, context.installationId);
        break;
      case 'rerequested':
        await this.handleCheckRerequested(owner, repo, check_run as unknown as CheckRun, context.installationId);
        break;
      default:
        this.logger.debug(`Unhandled check run action: ${action}`);
    }
  }

  /**
   * Handle check suite event
   */
  async handleCheckSuite(
    payload: CheckSuitePayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, check_suite, repository } = payload;
    const owner = context.owner;
    const repo = context.repo;

    this.logger.info(`Processing check suite: ${check_suite.id} (${action}) on ${owner}/${repo}`);

    if (action === 'completed') {
      const hasFailures = check_suite.conclusion === 'failure';

      if (hasFailures && this.config.createTaskOnFailure) {
        await this.createFailureTask(owner, repo, { checkSuiteId: check_suite.id }, context.installationId);
      }
    }
  }

  /**
   * Handle check run created
   */
  private async handleCheckCreated(
    _owner: string,
    _repo: string,
    checkRun: CheckRun,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`Check run created: ${checkRun.name}`);

    // Could create a task to perform the check if it's a hanumate check
    if (checkRun.name.startsWith('hanumate/')) {
      this.logger.debug(`RubberDuck check run initiated: ${checkRun.name}`);
    }
  }

  /**
   * Handle check run completed
   */
  private async handleCheckCompleted(
    _owner: string,
    _repo: string,
    checkRun: CheckRun,
    installationId: number
  ): Promise<void> {
    const conclusion = checkRun.conclusion;

    this.logger.info(`Check run completed: ${checkRun.name} - ${conclusion}`);

    // Create failure task if configured
    if (conclusion === 'failure' && this.config.createTaskOnFailure) {
      await this.createFailureTask(
        _owner,
        _repo,
        { checkRunName: checkRun.name, checkRunUrl: checkRun.html_url },
        installationId
      );
    }
  }

  /**
   * Handle check run rerequested
   */
  private async handleCheckRerequested(
    owner: string,
    repo: string,
    checkRun: CheckRun,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`Check run rerequested: ${checkRun.name}`);

    // Re-trigger the associated task
    const task = this.hanumate.createTask({
      type: 'comment',
      trigger: 'workflow_dispatch',
      owner,
      repo,
      context: {},
      payload: {
        action: 'rerequested',
        checkRunName: checkRun.name,
        checkRunUrl: checkRun.html_url,
      },
      priority: 'normal',
    });

    await this.hanumate.submitTask(task);
  }

  /**
   * Handle job completion
   */
  private async handleJobCompleted(
    owner: string,
    repo: string,
    job: WorkflowJob,
    installationId: number
  ): Promise<void> {
    if (job.conclusion === 'failure') {
      this.logger.warn(`Workflow job failed: ${job.name}`);

      if (this.config.createTaskOnFailure) {
        const task = this.hanumate.createTask({
          type: 'comment',
          trigger: 'workflow_dispatch',
          owner,
          repo,
          context: { branchName: job.head_branch },
          payload: {
            jobName: job.name,
            status: 'failed',
            runUrl: job.run_url,
            workflow: 'ci',
          },
          priority: 'high',
        });

        await this.hanumate.submitTask(task);
      }
    }
  }

  /**
   * Handle job started
   */
  private async handleJobStarted(
    _owner: string,
    _repo: string,
    job: WorkflowJob
  ): Promise<void> {
    this.logger.info(`Workflow job started: ${job.name} on ${job.head_branch}`);
  }

  /**
   * Handle workflow run completion
   */
  private async handleWorkflowCompleted(
    owner: string,
    repo: string,
    run: WorkflowRun,
    _installationId: number
  ): Promise<void> {
    this.logger.info(`Workflow run completed: ${run.name} (${run.conclusion || 'no conclusion'})`);

    if (run.conclusion === 'failure') {
      // Post failure summary
      this.logger.warn(`Workflow ${run.name} failed on ${owner}/${repo}:${run.head_branch}`);
    }
  }

  /**
   * Check if workflow should trigger
   */
  private isTriggerWorkflow(workflowName: string): boolean {
    const triggers = this.config.triggerWorkflows || [];
    return triggers.some(
      trigger =>
        workflowName.toLowerCase().includes(trigger.toLowerCase()) ||
        workflowName === trigger
    );
  }

  /**
   * Create task for failed checks
   */
  private async createFailureTask(
    owner: string,
    repo: string,
    extraContext: { checkSuiteId?: number; checkRunName?: string; checkRunUrl?: string },
    installationId: number
  ): Promise<void> {
    const task = this.hanumate.createTask({
      type: 'comment',
      trigger: 'workflow_dispatch',
      owner,
      repo,
      context: {},
      payload: {
        checkSuiteId: extraContext.checkSuiteId,
        ...extraContext,
      },
      priority: 'high',
    });

    await this.hanumate.submitTask(task);
  }

  /**
   * Create status check for PR
   */
  async createCheck(
    owner: string,
    repo: string,
    sha: string,
    options: {
      name: string;
      status: 'in_progress' | 'completed';
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
      title?: string;
      summary?: string;
      detailsUrl?: string;
    }
  ): Promise<void> {
    // This would be implemented via octokit.checks.create in the main app
    this.logger.info(`Would create check: ${options.name} for ${owner}/${repo}@${sha}`);
  }
}

/**
 * Factory function to create ActionsHandler
 */
export function createActionsHandler(
  hanumate: HanumateService,
  repoManager: RepoManager,
  config?: ActionsHandlerConfig,
  logger?: Logger
): ActionsHandler {
  return new ActionsHandler(hanumate, repoManager, config, logger);
}