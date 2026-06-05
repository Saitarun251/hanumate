/**
 * RubberDuck Runtime Integration Service
 * Handles communication between GitHub App and RubberDuck runtime
 */

import type { AgentTask, TaskResult, RubberDuckIntegration } from '../types.js';
import { MiniMaxService, createMiniMaxService } from './llm.js';

export interface RubberDuckConfig {
  /** Runtime API endpoint */
  apiUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default timeout for tasks (ms) */
  defaultTimeout: number;
  /** Maximum retries for failed tasks */
  maxRetries: number;
}

export class RubberDuckService implements RubberDuckIntegration {
  private _config: RubberDuckConfig;
  private tasks: Map<string, AgentTask> = new Map();
  private results: Map<string, TaskResult> = new Map();
  private llm: MiniMaxService;

  constructor(config: RubberDuckConfig) {
    this._config = {
      defaultTimeout: config.defaultTimeout || 300000,
      maxRetries: config.maxRetries || 3,
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
    };
    this.llm = createMiniMaxService();
  }

  /**
   * Submit a new task to the RubberDuck runtime
   */
  async submitTask(task: AgentTask): Promise<TaskResult> {
    const taskKey = `${task.repository.fullName}:${task.id}`;

    this.tasks.set(taskKey, { ...task, status: 'processing' });

    try {
      const response = await this.processTask(task);

      const result: TaskResult = {
        taskId: task.id,
        success: response.success,
        message: response.message,
        artifacts: response.artifacts,
        completedAt: new Date(),
      };

      this.results.set(taskKey, result);
      this.tasks.set(taskKey, { ...task, status: response.success ? 'completed' : 'failed' });

      return result;
    } catch (error) {
      const result: TaskResult = {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      };

      this.results.set(taskKey, result);
      this.tasks.set(taskKey, { ...task, status: 'failed' });

      return result;
    }
  }

  /**
   * Get the status of a task
   */
  async getTaskStatus(taskId: string): Promise<AgentTask['status']> {
    for (const [, task] of this.tasks) {
      if (task.id === taskId) {
        return task.status;
      }
    }
    return 'pending';
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    for (const [key, task] of this.tasks) {
      if (task.id === taskId) {
        this.tasks.set(key, { ...task, status: 'failed' });
        return true;
      }
    }
    return false;
  }

  /**
   * Get available agent capabilities
   */
  async getCapabilities(): Promise<string[]> {
    return [
      'code_review',
      'bug_fixing',
      'refactoring',
      'documentation',
      'testing',
      'feature_development',
      'security_audit',
      'performance_analysis',
      'code_generation',
      'debugging',
      'architectural_advice',
      'dependency_management',
    ];
  }

  /**
   * Create an agent task from webhook payload
   */
  createTask(params: {
    type: AgentTask['type'];
    trigger: AgentTask['trigger'];
    owner: string;
    repo: string;
    context: Partial<AgentTask['context']>;
    payload: Record<string, unknown>;
    priority?: AgentTask['priority'];
  }): AgentTask {
    return {
      id: this.generateTaskId(),
      type: params.type,
      trigger: params.trigger,
      repository: {
        owner: params.owner,
        repo: params.repo,
        fullName: `${params.owner}/${params.repo}`,
      },
      context: {
        issueNumber: params.context.issueNumber,
        prNumber: params.context.prNumber,
        commentId: params.context.commentId,
        branchName: params.context.branchName,
      },
      payload: params.payload,
      createdAt: new Date(),
      priority: params.priority || 'normal',
      status: 'pending',
    };
  }

  /**
   * Build task summary for GitHub comment
   */
  buildTaskSummary(result: TaskResult, task: AgentTask): string {
    const lines: string[] = [
      '## 🦆 RubberDuck Response',
      '',
      result.message || 'Task completed.',
    ];

    if (result.artifacts?.filesCreated?.length) {
      lines.push('', '### Files Created');
      result.artifacts.filesCreated.forEach(f => lines.push(`- \`${f}\``));
    }

    if (result.artifacts?.filesModified?.length) {
      lines.push('', '### Files Modified');
      result.artifacts.filesModified.forEach(f => lines.push(`- \`${f}\``));
    }

    if (result.error) {
      lines.push('', `❌ Error: ${result.error}`);
    }

    lines.push('', '---', '*Powered by RubberDuck Framework + MiniMax*');

    return lines.join('\n');
  }

  /**
   * Process task via RubberDuck Runtime (full framework)
   */
  private async processTask(task: AgentTask): Promise<{
    success: boolean;
    message?: string;
    artifacts?: TaskResult['artifacts'];
  }> {
    const payload = task.payload as Record<string, unknown>;
    const commentBody = payload.commentBody as string || '';
    const issueTitle = payload.issueTitle as string;
    const isPR = payload.isPR as boolean;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Processing task ${task.id} via RubberDuck Runtime`,
      service: 'rubberduck-github-app',
      taskType: task.type,
      trigger: task.trigger,
      repo: task.repository.fullName,
    }));

    try {
      // Call RubberDuck Runtime Server (full framework)
      const runtimeUrl = process.env.RUBBERDUCK_RUNTIME_URL || 'http://localhost:3001';
      const response = await fetch(`${runtimeUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          type: isPR ? 'review' : 'code',
          description: commentBody,
          context: JSON.stringify({
            issueTitle,
            issueBody: payload.issueBody,
            repo: task.repository.fullName,
            trigger: task.trigger,
          }),
          payload,
        }),
        signal: AbortSignal.timeout(this._config.defaultTimeout),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Runtime error ${response.status}: ${error}`);
      }

      const result = await response.json() as {
        success: boolean;
        message?: string;
        result?: string;
        error?: string;
        artifacts?: TaskResult['artifacts'];
      };

      return {
        success: result.success,
        message: result.message || result.result,
        artifacts: result.artifacts || {
          summary: `Processed via RubberDuck Runtime for ${task.repository.fullName}`,
        },
      };
    } catch (error) {
      // Fallback to direct MiniMax if runtime unavailable
      console.warn(`Runtime unavailable, falling back to direct MiniMax: ${error}`);

      const response = await this.llm.processIssueComment(commentBody, {
        issueTitle,
        issueBody: payload.issueBody as string,
        isPR,
        repo: task.repository.fullName,
      });

      return {
        success: response.success,
        message: response.message,
        artifacts: response.success ? {
          summary: `Processed (fallback mode) for ${task.repository.fullName}`,
        } : undefined,
      };
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Factory function to create RubberDuck service
 */
export function createRubberDuckService(config?: Partial<RubberDuckConfig>): RubberDuckService {
  return new RubberDuckService({
    apiUrl: config?.apiUrl || process.env.RUBBERDUCK_API_URL || 'http://localhost:3000',
    apiKey: config?.apiKey || process.env.RUBBERDUCK_API_KEY,
    defaultTimeout: config?.defaultTimeout || 300000,
    maxRetries: config?.maxRetries || 3,
  });
}