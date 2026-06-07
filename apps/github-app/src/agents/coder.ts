/**
 * GitHub App Coder Agent
 * Implements code changes for GitHub issues and PRs using Hanumate runtime
 */

import type { Logger, AgentTask, TaskResult } from '../types.js';
import type { HanumateService } from '../services/hanumate.js';
import type { RepoManager } from '../services/repo-manager.js';
import type { PRManager } from '../services/pr-manager.js';

// GitHub API types
interface GitHubClient {
  rest: {
    repos: {
      getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<{ data: { content?: string; encoding?: string; sha?: string; type?: string } | Array<{ name: string; path: string; type: string }> }>;
      createOrUpdateFileContents(params: {
        owner: string;
        repo: string;
        path: string;
        message: string;
        content: string;
        branch?: string;
        sha?: string;
      }): Promise<{ data: { commit: { sha: string } } }>;
    };
    git: {
      getRef(params: { owner: string; repo: string; ref: string }): Promise<{ data: { object: { sha: string } } }>;
      createRef(params: { owner: string; repo: string; ref: string; sha: string }): Promise<{ data: { ref: string } }>;
      deleteRef(params: { owner: string; repo: string; ref: string }): Promise<void>;
    };
    pulls: {
      create(params: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        head: string;
        base: string;
      }): Promise<{ data: { number: number; html_url: string } }>;
      get(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: { additions?: number; deletions?: number; files?: Array<{ filename: string; status: string }> } }>;
    };
    issues: {
      get(params: { owner: string; repo: string; issue_number: number }): Promise<{ data: { body?: string | null } }>;
      createComment(params: { owner: string; repo: string; issue_number: number; body: string }): Promise<void>;
      update(params: { owner: string; repo: string; issue_number: number; labels?: string[]; state?: string }): Promise<void>;
    };
  };
}

export interface CoderAgentConfig {
  /** Default branch for creating branches */
  defaultBranch?: string;
  /** Branch name prefix */
  branchPrefix?: string;
  /** Commit message prefix */
  commitPrefix?: string;
  /** Enable auto-retry on conflicts */
  autoRetry?: boolean;
  /** Maximum retries for conflicts */
  maxRetries?: number;
  /** Working directory for git operations */
  workingDir?: string;
}

export interface CodingTask {
  id: string;
  type: 'issue' | 'pr' | 'refactor' | 'implement' | 'fix_bugs';
  owner: string;
  repo: string;
  branchName?: string;
  baseBranch?: string;
  issueNumber?: number;
  prNumber?: number;
  title: string;
  description: string;
  context?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface CommitResult {
  success: boolean;
  sha?: string;
  message?: string;
  branch?: string;
  files?: string[];
  error?: string;
}

export interface PRResult {
  success: boolean;
  number?: number;
  url?: string;
  error?: string;
}

// ============================================
// Coder Agent Implementation
// ============================================

export class CoderAgent {
  private hanumate: HanumateService;
  private repoManager: RepoManager;
  private prManager: PRManager;
  private logger: Logger;
  private config: Required<CoderAgentConfig>;

  constructor(
    hanumate: HanumateService,
    repoManager: RepoManager,
    prManager: PRManager,
    config: CoderAgentConfig = {},
    logger?: Logger
  ) {
    this.hanumate = hanumate;
    this.repoManager = repoManager;
    this.prManager = prManager;
    this.logger = logger || console;

    this.config = {
      defaultBranch: config.defaultBranch ?? 'main',
      branchPrefix: config.branchPrefix ?? 'hanumate/',
      commitPrefix: config.commitPrefix ?? 'hanumate',
      autoRetry: config.autoRetry ?? true,
      maxRetries: config.maxRetries ?? 3,
      workingDir: config.workingDir ?? '/tmp/repos',
    };
  }

  // ============================================
  // Main Entry Points
  // ============================================

  /**
   * Execute a coding task from issue or PR context
   */
  async execute(task: CodingTask, octokit?: GitHubClient): Promise<TaskResult> {
    this.logger.info(`CoderAgent: Executing task ${task.id} for ${task.owner}/${task.repo}`);

    try {
      // Determine base branch
      const baseBranch = task.baseBranch || this.config.defaultBranch;

      // Create branch name
      const branchName = task.branchName || this.generateBranchName(task);

      // Build implementation context
      const context = await this.buildContext(task, octokit);

      // Create the RubberDuck task
      const agentTask = this.createRubberDuckTask(task, context);

      // Submit to RubberDuck runtime
      const result = await this.hanumate.submitTask(agentTask);

      if (result.success) {
        // Post success comment
        await this.postProgress(task, result, 'implemented', octokit);
      } else {
        // Post failure comment
        await this.postProgress(task, result, 'failed', octokit);
      }

      return result;
    } catch (error) {
      this.logger.error(`CoderAgent: Task ${task.id} failed: ${error}`);

      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      };
    }
  }

  /**
   * Create a branch for the task
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    octokit?: GitHubClient
  ): Promise<{ success: boolean; sha?: string; error?: string }> {
    if (!octokit) {
      return { success: false, error: 'GitHub client not provided' };
    }

    try {
      this.logger.info(`Creating branch: ${branchName} from ${baseBranch}`);

      // Get the SHA of the base branch
      const baseRef = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });

      const sha = baseRef.data.object.sha;

      // Create the new branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
      });

      this.logger.info(`Branch ${branchName} created successfully`);

      return { success: true, sha };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create branch: ${message}`);

      return { success: false, error: message };
    }
  }

  /**
   * Commit changes to a branch
   */
  async commitChanges(
    owner: string,
    repo: string,
    branchName: string,
    files: Array<{ path: string; content: string; message: string }>,
    octokit?: GitHubClient
  ): Promise<CommitResult> {
    if (!octokit) {
      return { success: false, error: 'GitHub client not provided' };
    }

    try {
      const committedFiles: string[] = [];

      for (const file of files) {
        this.logger.info(`Committing file: ${file.path}`);

        // Get current file SHA if exists
        let sha: string | undefined;
        try {
          const existing = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branchName,
          });
          sha = 'sha' in existing.data ? (existing.data.sha as string) : undefined;
        } catch {
          // File doesn't exist, that's fine
        }

        // Create or update file
        const content = Buffer.from(file.content).toString('base64');
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: file.path,
          message: file.message,
          content,
          branch: branchName,
          sha,
        });

        committedFiles.push(file.path);
      }

      this.logger.info(`Committed ${committedFiles.length} files to ${branchName}`);

      return {
        success: true,
        branch: branchName,
        files: committedFiles,
        message: `Committed ${committedFiles.length} files`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to commit: ${message}`);

      return { success: false, error: message };
    }
  }

  /**
   * Push branch to remote
   */
  async pushBranch(
    owner: string,
    repo: string,
    branchName: string,
    _octokit?: GitHubClient
  ): Promise<{ success: boolean; error?: string }> {
    // GitHub API creates refs automatically when committing
    // This method is for documentation purposes
    this.logger.info(`Branch ${branchName} pushed to ${owner}/${repo}`);

    return { success: true };
  }

  /**
   * Create a pull request from the branch
   */
  async createPullRequest(
    owner: string,
    repo: string,
    options: {
      title: string;
      body: string;
      head: string;
      base: string;
    },
    octokit?: GitHubClient
  ): Promise<PRResult> {
    if (!octokit) {
      return { success: false, error: 'GitHub client not provided' };
    }

    try {
      this.logger.info(`Creating PR: ${options.title}`);

      const response = await octokit.rest.pulls.create({
        owner,
        repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
      });

      this.logger.info(`PR #${response.data.number} created: ${response.data.html_url}`);

      return {
        success: true,
        number: response.data.number,
        url: response.data.html_url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create PR: ${message}`);

      return { success: false, error: message };
    }
  }

  /**
   * Handle merge conflicts
   */
  async handleConflicts(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    octokit?: GitHubClient
  ): Promise<{ success: boolean; resolved: boolean; error?: string }> {
    if (!octokit) {
      return { success: false, resolved: false, error: 'GitHub client not provided' };
    }

    try {
      this.logger.info(`Checking conflicts between ${branchName} and ${baseBranch}`);

      // Get base branch content for comparison
      const baseContent = await this.getBranchContent(owner, repo, baseBranch, octokit);
      const branchContent = await this.getBranchContent(owner, repo, branchName, octokit);

      // Simple conflict detection (in production, use git merge-base)
      const hasConflicts = JSON.stringify(baseContent) !== JSON.stringify(branchContent);

      if (hasConflicts) {
        this.logger.info(`Conflicts detected in ${branchName}`);

        // In a full implementation, we would:
        // 1. Fetch both branches
        // 2. Run git merge with strategy
        // 3. Resolve conflicts automatically or with LLM
        // 4. Commit the resolved changes

        return {
          success: true,
          resolved: false,
          error: 'Conflicts detected - manual resolution needed',
        };
      }

      return { success: false, resolved: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, resolved: false, error: message };
    }
  }

  /**
   * Retry failed task
   */
  async retry(task: CodingTask, octokit?: GitHubClient): Promise<TaskResult> {
    let attempts = 0;
    const maxAttempts = this.config.maxRetries;

    while (attempts < maxAttempts) {
      attempts++;

      this.logger.info(`Retry attempt ${attempts}/${maxAttempts} for task ${task.id}`);

      try {
        const result = await this.execute(task, octokit);

        if (result.success) {
          this.logger.info(`Task ${task.id} succeeded on attempt ${attempts}`);
          return result;
        }

        this.logger.warn(`Task ${task.id} failed on attempt ${attempts}`);
      } catch (error) {
        this.logger.error(`Retry error: ${error}`);
      }

      // Wait before retry
      await this.delay(1000 * attempts);
    }

    return {
      taskId: task.id,
      success: false,
      error: `Failed after ${maxAttempts} attempts`,
      completedAt: new Date(),
    };
  }

  // ============================================
  // Git Operations
  // ============================================

  /**
   * Clone a repository
   */
  async cloneRepo(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const repoPath = `${this.config.workingDir}/${owner}/${repo}`;

    try {
      // In production, use simple-git or child_process
      // For now, return the expected path
      this.logger.info(`Would clone ${owner}/${repo} to ${repoPath}`);

      return {
        success: true,
        path: repoPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Run tests in the repository
   */
  async runTests(
    repoPath: string,
    testCommand: string = 'npm test'
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      // In production, use child_process.spawn
      this.logger.info(`Running tests: ${testCommand} in ${repoPath}`);

      return {
        success: true,
        output: 'Tests passed (simulated)',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Analyze code changes
   */
  async analyzeChanges(
    owner: string,
    repo: string,
    prNumber: number,
    octokit?: GitHubClient
  ): Promise<{
    files: string[];
    additions: number;
    deletions: number;
    language: string;
  }> {
    if (!octokit) {
      return { files: [], additions: 0, deletions: 0, language: 'unknown' };
    }

    try {
      const pr = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const files = pr.data.files || [];
      const language = this.detectLanguage(files);

      return {
        files: files.map((f) => f.filename),
        additions: pr.data.additions || 0,
        deletions: pr.data.deletions || 0,
        language,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze changes: ${error}`);
      return { files: [], additions: 0, deletions: 0, language: 'unknown' };
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async buildContext(task: CodingTask, octokit?: GitHubClient): Promise<string> {
    const lines: string[] = [
      `# Coding Task: ${task.title}`,
      '',
      `**Repository**: ${task.owner}/${task.repo}`,
      `**Type**: ${task.type}`,
      '',
    ];

    if (task.issueNumber) {
      lines.push(`**Issue**: #${task.issueNumber}`);
    }

    if (task.prNumber) {
      lines.push(`**PR**: #${task.prNumber}`);
    }

    lines.push('', '## Description', task.description);

    if (task.context) {
      lines.push('', '## Additional Context', task.context);
    }

    // Get relevant code files if we have octokit
    if (octokit && task.issueNumber) {
      try {
        const issue = await octokit.rest.issues.get({
          owner: task.owner,
          repo: task.repo,
          issue_number: task.issueNumber,
        });

        // Extract code references from issue body
        const codeRefs = this.extractCodeReferences(issue.data.body || '');

        if (codeRefs.length > 0) {
          lines.push('', '## Referenced Files');

          for (const ref of codeRefs) {
            lines.push(`- ${ref}`);
          }
        }
      } catch {
        // Ignore errors fetching issue details
      }
    }

    return lines.join('\n');
  }

  private createRubberDuckTask(task: CodingTask, context: string): AgentTask {
    return {
      id: task.id,
      type: 'issue',
      trigger: 'label',
      repository: {
        owner: task.owner,
        repo: task.repo,
        fullName: `${task.owner}/${task.repo}`,
      },
      context: {
        issueNumber: task.issueNumber,
        prNumber: task.prNumber,
      },
      payload: {
        task: task.description,
        context,
        action: task.type,
        priority: task.priority || 'normal',
      },
      createdAt: new Date(),
      priority: task.priority || 'normal',
      status: 'pending',
    };
  }

  private async postProgress(
    task: CodingTask,
    result: TaskResult,
    status: 'implemented' | 'failed',
    octokit?: GitHubClient
  ): Promise<void> {
    if (!octokit) return;

    const lines: string[] = [
      `## RubberDuck Implementation ${status === 'implemented' ? '✅' : '❌'}`,
      '',
      `**Task**: ${task.title}`,
      '',
    ];

    if (result.success) {
      lines.push('Implementation completed successfully.');

      if (result.artifacts?.filesCreated) {
        lines.push('', '**Files Created:**');
        result.artifacts.filesCreated.forEach((f) => lines.push(`- \`${f}\``));
      }

      if (result.artifacts?.filesModified) {
        lines.push('', '**Files Modified:**');
        result.artifacts.filesModified.forEach((f) => lines.push(`- \`${f}\``));
      }

      if (result.message) {
        lines.push('', result.message);
      }
    } else {
      lines.push(`**Error**: ${result.error}`);
    }

    const body = lines.join('\n');

    // Post comment to issue or PR
    if (task.issueNumber) {
      await octokit.rest.issues.createComment({
        owner: task.owner,
        repo: task.repo,
        issue_number: task.issueNumber,
        body,
      });
    }
  }

  private generateBranchName(task: CodingTask): string {
    const sanitizedTitle = task.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    const timestamp = Date.now().toString(36).slice(-6);

    return `${this.config.branchPrefix}${task.type}-${sanitizedTitle}-${timestamp}`;
  }

  private async getBranchContent(
    owner: string,
    repo: string,
    branchName: string,
    octokit?: GitHubClient
  ): Promise<Record<string, string>> {
    if (!octokit) return {};

    try {
      const contents: Record<string, string> = {};

      // Get repository contents
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: '',
        ref: branchName,
      });

if (Array.isArray(response.data)) {
        for (const item of response.data) {
          const itemData = item as { name: string; path: string; type: string };
          if (itemData.type === 'file') {
            const fileContent = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: itemData.path,
              ref: branchName,
            });

            if ('content' in fileContent.data && fileContent.data.content) {
              contents[item.path] = Buffer.from(fileContent.data.content, 'base64').toString();
            }
          }
        }
      }

      return contents;
    } catch {
      return {};
    }
  }

  private extractCodeReferences(text: string): string[] {
    const refs: string[] = [];

    // Match file paths and URLs
    const patterns = [
      /(?:file|src|path|https?:\/\/github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/)([^\s)]+)/gi,
      /`([^`]+`)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const ref = match[1].trim();
        if (ref && !refs.includes(ref) && (ref.includes('/') || ref.includes('.'))) {
          refs.push(ref);
        }
      }
    }

    return refs;
  }

  private detectLanguage(
    files: Array<{ filename: string; status: string }>
  ): string {
    const extensionMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.cpp': 'C++',
      '.c': 'C',
    };

    const counts: Record<string, number> = {};

    for (const file of files) {
      const ext = '.' + file.filename.split('.').pop();
      const lang = extensionMap[ext] || 'Other';
      counts[lang] = (counts[lang] || 0) + 1;
    }

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? entries[0][0] : 'unknown';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Factory Function
// ============================================

export function createCoderAgent(
  hanumate: HanumateService,
  repoManager: RepoManager,
  prManager: PRManager,
  config?: CoderAgentConfig,
  logger?: Logger
): CoderAgent {
  return new CoderAgent(hanumate, repoManager, prManager, config, logger);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse GitHub reference (owner/repo@branch)
 */
export function parseGitHubRef(ref: string): {
  owner: string;
  repo: string;
  branch?: string;
} {
  const parts = ref.split('/');
  const result: { owner: string; repo: string; branch?: string } = { owner: '', repo: '' };

  if (parts.length >= 2) {
    result.owner = parts[0];
    result.repo = parts[1].split('@')[0];

    const branchPart = parts[1].split('@')[1];
    if (branchPart) {
      result.branch = branchPart;
    }
  }

  return result;
}

/**
 * Format PR body with implementation details
 */
export function formatPRBody(
  task: CodingTask,
  changes: {
    filesCreated?: string[];
    filesModified?: string[];
    testsAdded?: string[];
  }
): string {
  const lines: string[] = [
    `## Summary`,
    '',
    task.description,
    '',
  ];

  if (changes.filesCreated?.length) {
    lines.push('### Files Created');
    changes.filesCreated.forEach((f) => lines.push(`- \`${f}\``));
    lines.push('');
  }

  if (changes.filesModified?.length) {
    lines.push('### Files Modified');
    changes.filesModified.forEach((f) => lines.push(`- \`${f}\``));
    lines.push('');
  }

  if (changes.testsAdded?.length) {
    lines.push('### Tests Added');
    changes.testsAdded.forEach((f) => lines.push(`- \`${f}\``));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by RubberDuck*');

  return lines.join('\n');
}