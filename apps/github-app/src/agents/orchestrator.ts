/**
 * GitHub App Orchestrator Agent
 * Coordinates issue resolution by managing task flow between specialist agents
 */

import type { Logger, AgentTask, TaskResult } from '../types.js';
import type { HanumateService } from '../services/hanumate.js';
import type { RepoManager } from '../services/repo-manager.js';
import type { PRManager } from '../services/pr-manager.js';

// ============================================
// Type Definitions
// ============================================

export interface IssueContext {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  body: string | null;
  author: string;
  labels: string[];
  priority: 'low' | 'normal' | 'high';
}

export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  body: string | null;
  author: string;
  branch: string;
  baseBranch: string;
  labels: string[];
  isDraft: boolean;
}

export interface SubTask {
  id: string;
  description: string;
  agentType: 'coder' | 'reviewer';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  result?: TaskResult;
  dependencies: string[];
}

export interface OrchestratorState {
  orchestratorId: string;
  issueContext?: IssueContext;
  prContext?: PRContext;
  subTasks: Map<string, SubTask>;
  status: 'idle' | 'processing' | 'completed' | 'failed' | 'rolling_back';
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  rollbackHistory: RollbackEntry[];
}

interface RollbackEntry {
  taskId: string;
  action: string;
  timestamp: Date;
  success: boolean;
}

export interface OrchestratorConfig {
  maxRetries?: number;
  timeout?: number;
  autoUpdateProgress?: boolean;
  rollbackOnFailure?: boolean;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  user: { login: string };
  labels: Array<{ name: string }>;
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  user: { login: string };
  labels: Array<{ name: string }>;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

// ============================================
// Orchestrator Agent Implementation
// ============================================

export class OrchestratorAgent {
  private hanumate: HanumateService;
  private repoManager: RepoManager;
  private prManager: PRManager;
  private logger: Logger;
  private config: Required<OrchestratorConfig>;
  private currentState?: OrchestratorState;
  private pendingTasks: Map<string, AgentTask> = new Map();

  constructor(
    hanumate: HanumateService,
    repoManager: RepoManager,
    prManager: PRManager,
    config: OrchestratorConfig = {},
    logger?: Logger
  ) {
    this.hanumate = hanumate;
    this.repoManager = repoManager;
    this.prManager = prManager;
    this.logger = logger || console;

    this.config = {
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 300000, // 5 minutes default
      autoUpdateProgress: config.autoUpdateProgress ?? true,
      rollbackOnFailure: config.rollbackOnFailure ?? true,
    };
  }

  // ============================================
  // Main Entry Points
  // ============================================

  /**
   * Process an incoming issue event
   * @param issue - The issue data from the webhook
   */
  async handleIssue(issue: Issue): Promise<void> {
    this.logger.info(`Orchestrator: handling issue #${issue.number}`);

    // Create orchestrator state
    const issueContext: IssueContext = {
      owner: '', // Will be set from context
      repo: '',
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      author: issue.user.login,
      labels: issue.labels.map(l => l.name),
      priority: this.determinePriority(issue.labels),
    };

    this.initializeState(issueContext);

    try {
      // Create task list from issue
      const subTasks = await this.createTaskList(issueContext);
      this.logger.info(`Created ${subTasks.length} sub-tasks for issue #${issue.number}`);

      // Execute tasks in dependency order
      await this.executeTaskList(subTasks);

      // Update issue status on completion
      if (this.currentState?.status === 'completed') {
        await this.updateIssueStatus({
          state: 'resolved',
          comment: this.buildResolutionComment(subTasks),
        });
      }
    } catch (error) {
      await this.handleFailure(error as Error, 'issue');
    }
  }

  /**
   * Handle PR lifecycle events
   * @param pr - The pull request data
   */
  async onPRCreated(pr: PullRequest): Promise<void> {
    this.logger.info(`Orchestrator: handling PR #${pr.number}`);

    const prContext: PRContext = {
      owner: '',
      repo: '',
      prNumber: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.user.login,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      labels: pr.labels.map(l => l.name),
      isDraft: pr.draft,
    };

    this.initializeStateWithPR(prContext);

    try {
      // Analyze PR and create tasks
      const subTasks = await this.createPRTaskList(prContext);
      this.logger.info(`Created ${subTasks.length} sub-tasks for PR #${pr.number}`);

      // Execute analysis and review tasks
      await this.executeTaskList(subTasks);

      // Post summary comment
      if (!pr.draft) {
        await this.postPRSummary(prContext, subTasks);
      }
    } catch (error) {
      await this.handleFailure(error as Error, 'pr');
    }
  }

  // ============================================
  // Task Management
  // ============================================

  /**
   * Break down issue into sub-tasks for specialist agents
   */
  async createTaskList(issueContext: IssueContext): Promise<SubTask[]> {
    const tasks: SubTask[] = [];

    // Task 1: Code analysis (always needed)
    const analysisTask: SubTask = {
      id: this.generateTaskId('analysis'),
      description: `Analyze issue: "${issueContext.title}"`,
      agentType: 'coder',
      status: 'pending',
      dependencies: [],
    };
    tasks.push(analysisTask);

    // Task 2: Implementation planning (if not a simple question)
    if (this.requiresImplementation(issueContext)) {
      const planTask: SubTask = {
        id: this.generateTaskId('plan'),
        description: 'Create implementation plan for the issue',
        agentType: 'coder',
        status: 'pending',
        dependencies: [analysisTask.id],
      };
      tasks.push(planTask);

      // Task 3: Code implementation
      const implTask: SubTask = {
        id: this.generateTaskId('impl'),
        description: 'Implement the solution',
        agentType: 'coder',
        status: 'pending',
        dependencies: [planTask.id],
      };
      tasks.push(implTask);

      // Task 4: Code review
      const reviewTask: SubTask = {
        id: this.generateTaskId('review'),
        description: 'Review implementation for quality and correctness',
        agentType: 'reviewer',
        status: 'pending',
        dependencies: [implTask.id],
      };
      tasks.push(reviewTask);
    }

    // Task 5: Documentation (if complex issue)
    if (this.isComplexIssue(issueContext)) {
      const docTask: SubTask = {
        id: this.generateTaskId('doc'),
        description: 'Update documentation if needed',
        agentType: 'coder',
        status: 'pending',
        dependencies: [analysisTask.id],
      };
      tasks.push(docTask);
    }

    return tasks;
  }

  /**
   * Create task list for PR review workflow
   */
  async createPRTaskList(prContext: PRContext): Promise<SubTask[]> {
    const tasks: SubTask[] = [];

    // Task 1: PR Analysis
    const analysisTask: SubTask = {
      id: this.generateTaskId('pr-analysis'),
      description: `Analyze PR #${prContext.prNumber}: "${prContext.title}"`,
      agentType: 'reviewer',
      status: 'pending',
      dependencies: [],
    };
    tasks.push(analysisTask);

    // Task 2: Code review
    const reviewTask: SubTask = {
      id: this.generateTaskId('pr-review'),
      description: 'Perform detailed code review',
      agentType: 'reviewer',
      status: 'pending',
      dependencies: [analysisTask.id],
    };
    tasks.push(reviewTask);

    // Task 3: Testing verification (if tests changed)
    if (this.hasTestChanges(prContext)) {
      const testTask: SubTask = {
        id: this.generateTaskId('test-review'),
        description: 'Verify test coverage and quality',
        agentType: 'reviewer',
        status: 'pending',
        dependencies: [analysisTask.id],
      };
      tasks.push(testTask);
    }

    // Task 4: Documentation check
    const docTask: SubTask = {
      id: this.generateTaskId('pr-doc'),
      description: 'Verify documentation updates',
      agentType: 'reviewer',
      status: 'pending',
      dependencies: [reviewTask.id],
    };
    tasks.push(docTask);

    return tasks;
  }

  /**
   * Dispatch a task to the appropriate specialist agent
   */
  async dispatchToAgent(task: SubTask): Promise<TaskResult> {
    this.logger.info(`Dispatching task ${task.id} to ${task.agentType} agent`);

    // Mark task as in progress
    task.status = 'in_progress';
    this.updateProgress();

    try {
      // Create the RubberDuck task
      const agentTask = this.createAgentTask(task);
      this.pendingTasks.set(task.id, agentTask);

      // Submit to RubberDuck
      const result = await this.hanumate.submitTask(agentTask);

      // Update task status based on result
      task.status = result.success ? 'completed' : 'failed';
      task.result = result;

      this.updateProgress();

      return result;
    } catch (error) {
      task.status = 'failed';
      task.result = {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      };

      // Trigger rollback if configured
      if (this.config.rollbackOnFailure) {
        await this.performRollback(task);
      }

      throw error;
    }
  }

  // ============================================
  // Progress & Status Updates
  // ============================================

  /**
   * Update GitHub issue/PR status with current progress
   */
  async updateIssueStatus(progress: {
    state: 'analyzing' | 'in_progress' | 'resolved' | 'failed';
    comment?: string;
    labels?: string[];
  }): Promise<void> {
    if (!this.currentState) {
      this.logger.warn('No active orchestrator state to update');
      return;
    }

    const { issueContext } = this.currentState;
    if (!issueContext) {
      this.logger.warn('No issue context in current state');
      return;
    }

    // Update labels
    if (progress.labels) {
      await this.prManager.addLabels(
        issueContext.owner,
        issueContext.repo,
        issueContext.issueNumber,
        progress.labels
      );
    }

    // Post comment with progress
    if (progress.comment) {
      await this.prManager.createComment(
        issueContext.owner,
        issueContext.repo,
        issueContext.issueNumber,
        progress.comment
      );
    }

    this.logger.info(`Updated issue #${issueContext.issueNumber} status: ${progress.state}`);
  }

  /**
   * Post summary on PR creation/merge
   */
  private async postPRSummary(prContext: PRContext, tasks: SubTask[]): Promise<void> {
    const summary = this.buildPRSummary(prContext, tasks);

    await this.prManager.createComment(
      prContext.owner,
      prContext.repo,
      prContext.prNumber,
      summary
    );
  }

  // ============================================
  // Rollback Handling
  // ============================================

  /**
   * Handle task execution failure
   */
  private async handleFailure(error: Error, context: 'issue' | 'pr'): Promise<void> {
    this.logger.error(`Orchestrator failed: ${error.message}`);

    if (!this.currentState) return;

    this.currentState.status = 'failed';

    // Rollback completed tasks
    if (this.config.rollbackOnFailure) {
      this.currentState.status = 'rolling_back';
      await this.rollbackAllTasks();
    }

    // Update status
    if (context === 'issue' && this.currentState.issueContext) {
      await this.updateIssueStatus({
        state: 'failed',
        comment: `Failed to resolve issue: ${error.message}`,
        labels: ['needs-attention'],
      });
    }
  }

  /**
   * Rollback a failed task
   */
  private async performRollback(task: SubTask): Promise<void> {
    this.logger.info(`Rolling back task ${task.id}`);

    const rollbackEntry: RollbackEntry = {
      taskId: task.id,
      action: 'rollback',
      timestamp: new Date(),
      success: false,
    };

    try {
      // Notify the agent to rollback
      // In a real implementation, this would involve reverting code changes
      const rollbackTask = this.createRollbackTask(task);
      await this.hanumate.submitTask(rollbackTask);

      task.status = 'rolled_back';
      rollbackEntry.success = true;

      this.logger.info(`Successfully rolled back task ${task.id}`);
    } catch (error) {
      this.logger.error(`Rollback failed for task ${task.id}: ${error}`);
    }

    this.currentState?.rollbackHistory.push(rollbackEntry);
  }

  /**
   * Rollback all completed tasks
   */
  private async rollbackAllTasks(): Promise<void> {
    if (!this.currentState) return;

    const completedTasks = Array.from(this.currentState.subTasks.values())
      .filter(t => t.status === 'completed' || t.status === 'in_progress');

    for (const task of completedTasks.reverse()) {
      await this.performRollback(task);
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private initializeState(issueContext: IssueContext): void {
    this.currentState = {
      orchestratorId: this.generateTaskId('orchestrator'),
      issueContext,
      subTasks: new Map(),
      status: 'processing',
      progress: 0,
      startedAt: new Date(),
      rollbackHistory: [],
    };
  }

  private initializeStateWithPR(prContext: PRContext): void {
    this.currentState = {
      orchestratorId: this.generateTaskId('orchestrator'),
      prContext,
      subTasks: new Map(),
      status: 'processing',
      progress: 0,
      startedAt: new Date(),
      rollbackHistory: [],
    };
  }

  private async executeTaskList(tasks: SubTask[]): Promise<void> {
    // Store tasks in state
    for (const task of tasks) {
      this.currentState?.subTasks.set(task.id, task);
    }

    // Process tasks in dependency order
    for (const task of tasks) {
      // Check dependencies
      const depsMet = task.dependencies.every(
        depId => this.currentState?.subTasks.get(depId)?.status === 'completed'
      );

      if (!depsMet) {
        throw new Error(`Dependencies not met for task ${task.id}`);
      }

      // Execute task
      try {
        await this.dispatchToAgent(task);
      } catch (error) {
        if (this.config.rollbackOnFailure) {
          await this.rollbackAllTasks();
        }
        throw error;
      }
    }

    // All tasks completed successfully
    if (this.currentState) {
      this.currentState.status = 'completed';
      this.currentState.completedAt = new Date();
    }
    this.updateProgress();
  }

  private updateProgress(): void {
    if (!this.currentState) return;

    const total = this.currentState.subTasks.size;
    const completed = Array.from(this.currentState.subTasks.values())
      .filter(t => t.status === 'completed').length;

    this.currentState.progress = total > 0 ? (completed / total) * 100 : 0;

    if (this.config.autoUpdateProgress) {
      this.logger.info(`Progress: ${this.currentState.progress.toFixed(0)}% (${completed}/${total})`);
    }
  }

  private generateTaskId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createAgentTask(subTask: SubTask): AgentTask {
    const context = this.currentState?.issueContext
      ? {
          issueNumber: this.currentState.issueContext.issueNumber,
        }
      : {
          prNumber: this.currentState?.prContext?.prNumber,
        };

    return {
      id: subTask.id,
      type: this.currentState?.issueContext ? 'issue' : 'pr',
      trigger: 'label',
      repository: {
        owner: this.currentState?.issueContext?.owner || '',
        repo: this.currentState?.issueContext?.repo || '',
        fullName: `${this.currentState?.issueContext?.owner}/${this.currentState?.issueContext?.repo}`,
      },
      context,
      payload: {
        task: subTask.description,
        agentType: subTask.agentType,
      },
      createdAt: new Date(),
      priority: this.currentState?.issueContext?.priority || 'normal',
      status: 'pending',
    };
  }

  private createRollbackTask(task: SubTask): AgentTask {
    return {
      id: this.generateTaskId('rollback'),
      type: this.currentState?.issueContext ? 'issue' : 'pr',
      trigger: 'label',
      repository: {
        owner: this.currentState?.issueContext?.owner || '',
        repo: this.currentState?.issueContext?.repo || '',
        fullName: '',
      },
      context: {},
      payload: {
        action: 'rollback',
        originalTaskId: task.id,
        description: `Rollback: ${task.description}`,
      },
      createdAt: new Date(),
      priority: 'high',
      status: 'pending',
    };
  }

  private determinePriority(labels: Array<{ name: string }>): 'low' | 'normal' | 'high' {
    const labelNames = labels.map(l => l.name.toLowerCase());
    if (labelNames.some(l => l.includes('urgent') || l.includes('critical') || l.includes('bug'))) {
      return 'high';
    }
    if (labelNames.some(l => l.includes('low-priority') || l.includes('enhancement'))) {
      return 'low';
    }
    return 'normal';
  }

  private requiresImplementation(context: IssueContext): boolean {
    // Determine if the issue requires actual code implementation
    const implementationKeywords = ['fix', 'implement', 'add', 'create', 'change', 'update'];
    const title = context.title.toLowerCase();
    return implementationKeywords.some(kw => title.includes(kw));
  }

  private isComplexIssue(context: IssueContext): boolean {
    // Check if issue body has substantial content or multiple labels
    return (context.body?.length ?? 0) > 200 || context.labels.length > 3;
  }

  private hasTestChanges(context: PRContext): boolean {
    // In a real implementation, this would check the PR diff
    return context.labels.some(l => l.toLowerCase().includes('test'));
  }

  private buildResolutionComment(tasks: SubTask[]): string {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;

    return `## Resolution Summary

I've analyzed and worked on this issue.

**Progress**: ${completed}/${total} tasks completed

**Completed Tasks**:
${tasks.filter(t => t.status === 'completed').map(t => `- ${t.description}`).join('\n')}

${tasks.some(t => t.status === 'failed') ? `
**Issues Encountered**:
${tasks.filter(t => t.status === 'failed').map(t => `- ${t.description}`).join('\n')}
` : ''}

Please review the changes and let me know if you have any questions!`;
  }

  private buildPRSummary(prContext: PRContext, tasks: SubTask[]): string {
    const reviewTasks = tasks.filter(t => t.agentType === 'reviewer');
    const completed = reviewTasks.filter(t => t.status === 'completed').length;

    return `## PR Review Summary

**PR**: #${prContext.prNumber} - ${prContext.title}
**Author**: @${prContext.author}

I've completed the initial review:

**Status**: ${completed}/${reviewTasks.length} review tasks completed

${reviewTasks.map(t => `- ${t.status === 'completed' ? '✅' : '⏳'} ${t.description}`).join('\n')}

Please review the changes and let me know if you have any feedback!`;
  }

  // ============================================
  // State Access
  // ============================================

  /**
   * Get current orchestrator state
   */
  getState(): OrchestratorState | undefined {
    return this.currentState;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): SubTask | undefined {
    return this.currentState?.subTasks.get(taskId);
  }

  /**
   * Check if orchestrator is currently processing
   */
  isProcessing(): boolean {
    return this.currentState?.status === 'processing';
  }
}

// ============================================
// Factory Function
// ============================================

export function createOrchestratorAgent(
  hanumate: HanumateService,
  repoManager: RepoManager,
  prManager: PRManager,
  config?: OrchestratorConfig,
  logger?: Logger
): OrchestratorAgent {
  return new OrchestratorAgent(hanumate, repoManager, prManager, config, logger);
}