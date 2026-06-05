/**
 * GitHub App Type Definitions
 * TypeScript types for webhook events and configuration
 */

import type { EventPayloadMap } from '@octokit/webhooks-types';

// Re-export webhook event types
export type IssueEventPayload = EventPayloadMap['issues'];
export type IssueCommentPayload = EventPayloadMap['issue_comment'];
export type PREventPayload = EventPayloadMap['pull_request'];
export type PRReviewPayload = EventPayloadMap['pull_request_review'];
export type LabelPayload = EventPayloadMap['label'];
export type CheckRunPayload = EventPayloadMap['check_run'];
export type CheckSuitePayload = EventPayloadMap['check_suite'];

// Re-export common types
export type Issue = EventPayloadMap['issues']['issue'];
export type PullRequest = EventPayloadMap['pull_request']['pull_request'];
export type PullRequestReview = EventPayloadMap['pull_request_review']['review'];
export type Label = EventPayloadMap['label']['label'];
export type Installation = EventPayloadMap['installation']['installation'];
// Simple object types to avoid complex webhook-types issues
export type Repository = { id: number; name: string; full_name: string; owner: { login: string } };
export type Organization = { login: string; id: number };

// ============================================
// Configuration Types
// ============================================

export type TriggerMode =
  | 'mention'
  | 'label'
  | 'pr_assignment'
  | 'branch_pattern'
  | 'workflow_dispatch';

export interface RepoConfig {
  owner: string;
  repo: string;
  enabled: boolean;
  triggers: {
    /** Mention @rubberduck or specific bot username to trigger */
    mention?: boolean;
    /** Trigger on specific labels (configured below) */
    label?: boolean;
    /** Trigger when PR is assigned to the bot */
    prAssignment?: boolean;
    /** Trigger on branch name patterns */
    branchPattern?: string | string[];
    /** Trigger via GitHub Actions workflow dispatch */
    workflowDispatch?: boolean;
  };
  /** Labels that trigger the bot (when label mode is enabled) */
  triggerLabels?: string[];
  /** Bot username to respond to mentions (default: app name) */
  botUsername?: string;
  /** Welcome message template */
  welcomeMessage?: string;
  /** Custom instructions per repo */
  customInstructions?: string;
  /** Maximum concurrent tasks per repo */
  maxConcurrentTasks?: number;
}

export interface GitHubAppConfig {
  /** Per-repository configurations */
  repos: Map<string, RepoConfig>;
  /** Default configuration for new repos */
  defaultConfig: Omit<RepoConfig, 'owner' | 'repo'>;
  /** Global settings */
  settings: {
    /** Enable verbose logging */
    verboseLogging: boolean;
    /** Auto-comment on new issues */
    autoReply: boolean;
    /** Default welcome message */
    defaultWelcomeMessage: string;
    /** Timeout for agent tasks (ms) */
    taskTimeout: number;
    /** Rate limit for comments (ms between comments) */
    commentRateLimit: number;
  };
}

// ============================================
// Webhook Context Types
// ============================================

export interface WebhookContext {
  /** GitHub delivery ID */
  deliveryId: string;
  /** Event name (e.g., 'issues', 'pull_request') */
  event: string;
  /** Installation context */
  installation?: Installation;
  /** Repository where event occurred */
  repository?: Repository;
  /** Organization context (if applicable) */
  organization?: Organization;
}

// ============================================
// Task & Agent Types
// ============================================

export interface AgentTask {
  id: string;
  type: 'issue' | 'pr' | 'review' | 'comment' | 'branch';
  trigger: TriggerMode;
  repository: {
    owner: string;
    repo: string;
    fullName: string;
  };
  context: {
    issueNumber?: number;
    prNumber?: number;
    commentId?: number;
    branchName?: string;
    workflowName?: string;
  };
  payload: Record<string, unknown>;
  createdAt: Date;
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  message?: string;
  artifacts?: {
    filesCreated?: string[];
    filesModified?: string[];
    summary?: string;
  };
  error?: string;
  completedAt: Date;
}

// ============================================
// Service Types
// ============================================

export interface RubberDuckIntegration {
  /** Submit a task to RubberDuck runtime */
  submitTask(task: AgentTask): Promise<TaskResult>;
  /** Get current status of a task */
  getTaskStatus(taskId: string): Promise<AgentTask['status']>;
  /** Cancel a running task */
  cancelTask(taskId: string): Promise<boolean>;
  /** Get available agent capabilities */
  getCapabilities(): Promise<string[]>;
}

export interface RepoManagerService {
  /** Get configuration for a repository */
  getRepoConfig(owner: string, repo: string): RepoConfig | undefined;
  /** Update repository configuration */
  updateRepoConfig(owner: string, repo: string, config: Partial<RepoConfig>): void;
  /** List all configured repositories */
  listRepos(): Array<{ owner: string; repo: string; config: RepoConfig }>;
  /** Check if a repository is enabled */
  isRepoEnabled(owner: string, repo: string): boolean;
  /** Validate trigger conditions */
  shouldTrigger(owner: string, repo: string, mode: TriggerMode, payload: Record<string, unknown>): boolean;
}

export interface PRManagerService {
  /** Create a PR comment */
  createComment(owner: string, repo: string, prNumber: number, body: string): Promise<void>;
  /** Update PR description */
  updatePRDescription(owner: string, repo: string, prNumber: number, description: string): Promise<void>;
  /** Add PR labels */
  addLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void>;
  /** Remove PR labels */
  removeLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void>;
  /** Request PR reviewers */
  requestReviewers(owner: string, repo: string, prNumber: number, reviewers: string[]): Promise<void>;
  /** Get PR diff */
  getPRDiff(owner: string, repo: string, prNumber: number): Promise<string>;
  /** Check if PR is ready for review */
  isReadyForReview(pr: PullRequest): boolean;
}

// ============================================
// App State Types
// ============================================

export interface AppState {
  /** Active installations */
  installations: Map<number, {
    id: number;
    account: string;
    repos: Set<string>;
    createdAt: Date;
  }>;
  /** Active tasks by installation */
  tasks: Map<number, Map<string, AgentTask>>;
  /** Configuration cache */
  config: GitHubAppConfig;
}

// ============================================
// Utility Types
// ============================================

export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export type OctokitClient = import('@octokit/rest').Octokit;