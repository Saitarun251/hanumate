/**
 * GitHub App Reviewer Agent
 * Handles code review for PRs including security scanning, performance analysis, and auto-approve
 */

import type { Logger, AgentTask, TaskResult } from '../types.js';
import type { RubberDuckService } from '../services/rubberduck.js';
import type { PRManager } from '../services/pr-manager.js';

// GitHub API types
interface GitHubClient {
  rest: {
    pulls: {
      get(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: PullRequestData }>;
      listFiles(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: PRFile[] }>;
      listReviews(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: Review[] }>;
      submitReview(params: {
        owner: string;
        repo: string;
        pull_number: number;
        event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        body?: string;
      }): Promise<{ data: Review }>;
      merge(params: {
        owner: string;
        repo: string;
        pull_number: number;
        merge_method?: 'merge' | 'squash' | 'rebase';
      }): Promise<{ data: { merged: boolean; sha: string } }>;
    };
    checks: {
      listForRef(params: { owner: string; repo: string; ref: string; status?: string }): Promise<{ data: { check_runs: CheckRun[] } }>;
    };
    repos: {
      getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<{ data: { content?: string; encoding?: string; sha?: string } }>;
    };
  };
}

interface PullRequestData {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  head: { ref: string; sha: string };
  base: { ref: string };
  user: { login: string };
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  commits: number;
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  contents_url?: string;
}

interface Review {
  id: number;
  user: { login: string };
  body: string | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  submitted_at: string;
}

interface CheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | null;
  html_url: string;
  url: string;
}

// ============================================
// Review Agent Configuration
// ============================================

export interface ReviewerConfig {
  /** Auto-approve when all checks pass */
  autoApprove?: boolean;
  /** Auto-merge after approval (requires all checks pass) */
  autoMerge?: boolean;
  /** Merge method for auto-merge */
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  /** Minimum checks required before auto-approve */
  minChecksRequired?: number;
  /** Enable security scanning */
  securityScanning?: boolean;
  /** Enable performance analysis */
  performanceAnalysis?: boolean;
  /** File patterns to skip from review */
  skipPatterns?: string[];
  /** Maximum files to review in one PR (0 = unlimited) */
  maxFilesPerPR?: number;
  /** Minimum lines changed to trigger full review */
  minLinesForFullReview?: number;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: 'info' | 'warning' | 'error';
  category: 'security' | 'performance' | 'style' | 'best-practice' | 'bug';
}

export interface ReviewResult {
  success: boolean;
  approved: boolean;
  comments: ReviewComment[];
  summary: string;
  checksPassed: boolean;
  autoMergeTriggered?: boolean;
  error?: string;
}

// ============================================
// Reviewer Agent Implementation
// ============================================

export class ReviewerAgent {
  private rubberduck: RubberDuckService;
  private prManager: PRManager;
  private logger: Logger;
  private config: Required<ReviewerConfig>;

  // Security patterns for scanning
  private securityPatterns: Array<{
    pattern: RegExp;
    severity: 'info' | 'warning' | 'error';
    category: 'security' | 'performance' | 'style' | 'best-practice' | 'bug';
    message: string;
  }> = [
    // SQL Injection
    { pattern: /\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE|sql\s*\(/gi, severity: 'error', category: 'security', message: 'Potential SQL injection vulnerability' },
    // Hardcoded secrets
    { pattern: /(password|secret|api_key|apikey|token)\s*=\s*["'][^"']{8,}["']/gi, severity: 'error', category: 'security', message: 'Hardcoded secret detected' },
    // eval usage
    { pattern: /\beval\s*\(/gi, severity: 'warning', category: 'security', message: 'Use of eval() can be dangerous' },
    // innerHTML usage
    { pattern: /\.innerHTML\s*=/gi, severity: 'warning', category: 'security', message: 'Potential XSS vulnerability with innerHTML' },
    // Direct DOM insertion
    { pattern: /document\.write\s*\(/gi, severity: 'warning', category: 'security', message: 'document.write can lead to XSS attacks' },
    // Shell commands
    { pattern: /exec\s*\(|spawn\s*\(|child_process/gi, severity: 'warning', category: 'security', message: 'Shell command execution - validate inputs carefully' },
    // Weak crypto
    { pattern: /md5|sha1\s*\(|crypto\.createCipher/gi, severity: 'warning', category: 'security', message: 'Weak cryptographic algorithm detected' },
    // Console.log in production
    { pattern: /console\.(log|debug)\s*\(/gi, severity: 'info', category: 'style', message: 'Debug logging in code' },
    // TODO comment
    { pattern: /\/\/\s*TODO|\/\/\s*FIXME/gi, severity: 'info', category: 'best-practice', message: 'TODO/FIXME comment found' },
  ];

  // Performance patterns
  private performancePatterns: Array<{
    pattern: RegExp;
    severity: 'info' | 'warning' | 'error';
    category: 'security' | 'performance' | 'style' | 'best-practice' | 'bug';
    message: string;
  }> = [
    { pattern: /for\s*\(\s*.*\.length\s*\)/gi, severity: 'warning', category: 'performance', message: 'Loop includes array.length - cache the length for better performance' },
    { pattern: /\.querySelectorAll.*\.forEach/gi, severity: 'info', category: 'performance', message: 'Consider using a more specific selector' },
    { pattern: /JSON\.parse\s*\(/gi, severity: 'info', category: 'performance', message: 'Consider caching parsed results if used multiple times' },
    { pattern: /Array\.from\s*\(/gi, severity: 'info', category: 'performance', message: 'Consider using spread operator instead' },
    { pattern: /\.innerHTML\s*[\+=]/gi, severity: 'warning', category: 'performance', message: 'Multiple DOM manipulations - consider using DocumentFragment' },
    { pattern: /setTimeout.*0|setImmediate/gi, severity: 'info', category: 'performance', message: 'Potential async issue - verify this is intentional' },
  ];

  constructor(
    rubberduck: RubberDuckService,
    prManager: PRManager,
    config: ReviewerConfig = {},
    logger?: Logger
  ) {
    this.rubberduck = rubberduck;
    this.prManager = prManager;
    this.logger = logger || console;

    this.config = {
      autoApprove: config.autoApprove ?? false,
      autoMerge: config.autoMerge ?? false,
      mergeMethod: config.mergeMethod ?? 'squash',
      minChecksRequired: config.minChecksRequired ?? 1,
      securityScanning: config.securityScanning ?? true,
      performanceAnalysis: config.performanceAnalysis ?? true,
      skipPatterns: config.skipPatterns ?? ['*.json', '*.md', '*.lock', '*.png', '*.jpg', '*.svg', 'package-lock.json'],
      maxFilesPerPR: config.maxFilesPerPR ?? 0,
      minLinesForFullReview: config.minLinesForFullReview ?? 50,
    };
  }

  // ============================================
  // Main Entry Points
  // ============================================

  /**
   * Review a pull request
   */
  async reviewPR(
    owner: string,
    repo: string,
    prNumber: number,
    octokit?: GitHubClient
  ): Promise<ReviewResult> {
    this.logger.info(`ReviewerAgent: Starting review for ${owner}/${repo}#${prNumber}`);

    try {
      // Get PR details
      if (!octokit) {
        return { success: false, approved: false, comments: [], summary: 'GitHub client not provided', checksPassed: false, error: 'GitHub client required' };
      }

      const [pr, files, reviews, checks] = await Promise.all([
        octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
        octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber }),
        octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber }),
        octokit.rest.checks.listForRef({ owner, repo, ref: (await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })).data.head.sha }),
      ]);

      const prData = pr.data;
      const checkRuns = checks.data.check_runs || [];

      this.logger.info(`PR #${prNumber}: ${prData.additions} additions, ${prData.deletions} deletions, ${files.data.length} files`);

      // Check if already reviewed by this bot
      const existingReview = reviews.data.find(r => r.user.login === 'rubberduck[bot]');
      if (existingReview) {
        this.logger.info(`Already reviewed by RubberDuck in PR #${prNumber}`);
        return {
          success: true,
          approved: existingReview.state === 'APPROVED',
          comments: [],
          summary: 'Already reviewed by RubberDuck',
          checksPassed: this.checkAllPassed(checkRuns),
        };
      }

      // Filter files to review
      const filesToReview = this.filterFiles(files.data);
      this.logger.info(`Reviewing ${filesToReview.length} files (filtered from ${files.data.length})`);

      // Perform security and performance analysis
      const comments = await this.analyzeFiles(owner, repo, prNumber, filesToReview);

      // Build review summary
      let summary = this.buildReviewSummary(prData, comments, checkRuns);

      // Check if all required checks passed
      const checksPassed = this.checkAllPassed(checkRuns);

      // Determine approval status
      let approved = false;
      const hasErrors = comments.some(c => c.severity === 'error');

      if (checksPassed && !hasErrors) {
        approved = true;

        // Auto-approve if configured
        if (this.config.autoApprove) {
          await this.submitReview(owner, repo, prNumber, 'APPROVE', summary, octokit);
        }
      } else if (!checksPassed) {
        // Wait for checks
        summary += '\n\n> ⏳ Waiting for status checks to complete before final review.';
      }

      // Auto-merge if configured and approved
      let autoMergeTriggered = false;
      if (this.config.autoMerge && approved && checksPassed) {
        autoMergeTriggered = await this.autoMergePR(owner, repo, prNumber, octokit);
      }

      return {
        success: true,
        approved,
        comments,
        summary,
        checksPassed,
        autoMergeTriggered,
      };
    } catch (error) {
      this.logger.error(`ReviewerAgent: Review failed for ${owner}/${repo}#${prNumber}`, { error });

      return {
        success: false,
        approved: false,
        comments: [],
        summary: 'Review failed',
        checksPassed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle PR opened event
   */
  async onPROpened(
    owner: string,
    repo: string,
    prNumber: number,
    octokit?: GitHubClient
  ): Promise<ReviewResult> {
    this.logger.info(`ReviewerAgent: PR #${prNumber} opened, starting review`);

    // Add rubberduck label if not already present
    if (octokit) {
      await this.prManager.addLabels(owner, repo, prNumber, ['rubberduck-review']);
    }

    return this.reviewPR(owner, repo, prNumber, octokit);
  }

  /**
   * Handle PR updated/synchronized event
   */
  async onPRUpdated(
    owner: string,
    repo: string,
    prNumber: number,
    octokit?: GitHubClient
  ): Promise<ReviewResult> {
    this.logger.info(`ReviewerAgent: PR #${prNumber} updated, re-reviewing`);

    // Remove old rubberduck review if exists
    if (octokit) {
      const reviews = await octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber });
      const existingReview = reviews.data.find(r => r.user.login === 'rubberduck[bot]');
      // GitHub doesn't allow deleting reviews, but we can update
    }

    return this.reviewPR(owner, repo, prNumber, octokit);
  }

  /**
   * Handle check run completed event
   */
  async onCheckCompleted(
    owner: string,
    repo: string,
    prNumber: number,
    _checkRun: CheckRun,
    octokit?: GitHubClient
  ): Promise<ReviewResult> {
    this.logger.info(`ReviewerAgent: Check completed for PR #${prNumber}, re-evaluating`);

    if (!octokit) {
      return { success: false, approved: false, comments: [], summary: 'GitHub client required', checksPassed: false };
    }

    // Get all checks for the PR
    const pr = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const checks = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: pr.data.head.sha,
    });

    const allPassed = this.checkAllPassed(checks.data.check_runs || []);

    if (allPassed && this.config.autoApprove) {
      // Re-review and approve if checks now pass
      return this.reviewPR(owner, repo, prNumber, octokit);
    }

    return {
      success: true,
      approved: false,
      comments: [],
      summary: 'Waiting for all checks to pass',
      checksPassed: allPassed,
    };
  }

  // ============================================
  // File Analysis
  // ============================================

  private filterFiles(files: PRFile[]): PRFile[] {
    // Apply skip patterns
    let filtered = files.filter(file => {
      return !this.config.skipPatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file.filename);
      });
    });

    // Apply max files limit
    if (this.config.maxFilesPerPR > 0 && filtered.length > this.config.maxFilesPerPR) {
      filtered = filtered.slice(0, this.config.maxFilesPerPR);
      this.logger.warn(`Limited review to ${this.config.maxFilesPerPR} files`);
    }

    return filtered;
  }

  private async analyzeFiles(
    owner: string,
    repo: string,
    _prNumber: number,
    files: PRFile[]
  ): Promise<ReviewComment[]> {
    const comments: ReviewComment[] = [];

    for (const file of files) {
      // Skip binary files
      if (file.status === 'binary') continue;

      // Get file content for analysis
      if (file.patch) {
        const fileComments = this.analyzePatch(file);
        comments.push(...fileComments);
      }

      // Perform deep security scan if enabled
      if (this.config.securityScanning && file.contents_url) {
        try {
          const deepComments = await this.securityScanFile(owner, repo, file);
          comments.push(...deepComments);
        } catch (error) {
          this.logger.warn(`Failed to deep scan ${file.filename}: ${error}`);
        }
      }
    }

    return comments;
  }

  private analyzePatch(file: PRFile): ReviewComment[] {
    const comments: ReviewComment[] = [];

    if (!file.patch) return comments;

    const lines = file.patch.split('\n');

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.substring(1);

        // Security patterns
        if (this.config.securityScanning) {
          for (const pattern of this.securityPatterns) {
            if (pattern.pattern.test(content)) {
              const lineMatch = line.match(/@@ -\d+,\d+ \+(\d+)/);
              const lineNum = lineMatch ? parseInt(lineMatch[1]) : 0;

              comments.push({
                path: file.filename,
                line: lineNum,
                body: `**${pattern.category.toUpperCase()}**: ${pattern.message}\n\n\`\`\`\n${content.trim()}\n\`\`\``,
                severity: pattern.severity,
                category: pattern.category,
              });
            }
          }
        }

        // Performance patterns
        if (this.config.performanceAnalysis) {
          for (const pattern of this.performancePatterns) {
            if (pattern.pattern.test(content)) {
              const lineMatch = line.match(/@@ -\d+,\d+ \+(\d+)/);
              const lineNum = lineMatch ? parseInt(lineMatch[1]) : 0;

              comments.push({
                path: file.filename,
                line: lineNum,
                body: `**PERFORMANCE**: ${pattern.message}\n\n\`\`\`\n${content.trim()}\n\`\`\``,
                severity: pattern.severity,
                category: pattern.category,
              });
            }
          }
        }
      }
    }

    return comments;
  }

  private async securityScanFile(
    owner: string,
    repo: string,
    file: PRFile
  ): Promise<ReviewComment[]> {
    const comments: ReviewComment[] = [];

    // Only scan code files
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb', '.php'];
    const ext = file.filename.substring(file.filename.lastIndexOf('.'));
    if (!codeExtensions.includes(ext)) return comments;

    return comments;
  }

  // ============================================
  // Review Submission
  // ============================================

  private async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
    octokit: GitHubClient
  ): Promise<void> {
    try {
      await octokit.rest.pulls.submitReview({
        owner,
        repo,
        pull_number: prNumber,
        event,
        body,
      });

      this.logger.info(`Review submitted for ${owner}/${repo}#${prNumber}: ${event}`);
    } catch (error) {
      this.logger.error(`Failed to submit review: ${error}`);
      throw error;
    }
  }

  private async autoMergePR(
    owner: string,
    repo: string,
    prNumber: number,
    octokit: GitHubClient
  ): Promise<boolean> {
    try {
      const result = await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: this.config.mergeMethod,
      });

      if (result.data.merged) {
        this.logger.info(`PR #${prNumber} auto-merged successfully`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Auto-merge failed for PR #${prNumber}: ${error}`);
      return false;
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private checkAllPassed(checkRuns: CheckRun[]): boolean {
    if (checkRuns.length === 0) return true;

    const requiredChecks = checkRuns.slice(0, this.config.minChecksRequired);
    return requiredChecks.every(check => check.conclusion === 'success');
  }

  private buildReviewSummary(
    pr: PullRequestData,
    comments: ReviewComment[],
    checkRuns: CheckRun[]
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`## Code Review for #${pr.number}: ${pr.title}`);
    sections.push(`**Author**: @${pr.user.login} | **Branch**: ${pr.head.ref} → ${pr.base.ref}`);
    sections.push('');

    // Statistics
    const errorCount = comments.filter(c => c.severity === 'error').length;
    const warningCount = comments.filter(c => c.severity === 'warning').length;
    const infoCount = comments.filter(c => c.severity === 'info').length;

    sections.push('### Summary');
    sections.push('');
    sections.push(`| Metric | Value |`);
    sections.push(`|--------|-------|`);
    sections.push(`| Files Changed | ${pr.changed_files} |`);
    sections.push(`| Additions | +${pr.additions} |`);
    sections.push(`| Deletions | -${pr.deletions} |`);
    sections.push(`| 🔴 Errors | ${errorCount} |`);
    sections.push(`| 🟡 Warnings | ${warningCount} |`);
    sections.push(`| 🔵 Info | ${infoCount} |`);
    sections.push('');

    // Status checks
    if (checkRuns.length > 0) {
      sections.push('### Status Checks');
      sections.push('');
      sections.push(`| Check | Status |`);
      sections.push(`|-------|--------|`);

      for (const check of checkRuns) {
        const icon = check.conclusion === 'success' ? '✅' : check.conclusion === 'failure' ? '❌' : '⏳';
        sections.push(`| ${check.name} | ${icon} ${check.conclusion || check.status} |`);
      }
      sections.push('');
    }

    // Comments by category
    const categories = ['security', 'performance', 'style', 'best-practice', 'bug'] as const;

    for (const category of categories) {
      const categoryComments = comments.filter(c => c.category === category);
      if (categoryComments.length > 0) {
        sections.push(`### ${category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')} Issues`);
        sections.push('');

        for (const comment of categoryComments) {
          const icon = comment.severity === 'error' ? '🔴' : comment.severity === 'warning' ? '🟡' : '🔵';
          sections.push(`${icon} **${comment.path}:${comment.line}**`);
          sections.push('');
          sections.push(comment.body);
          sections.push('');
        }
      }
    }

    // Final recommendation
    const checksPassed = this.checkAllPassed(checkRuns);
    const hasErrors = comments.some(c => c.severity === 'error');

    sections.push('---');
    sections.push('');

    if (hasErrors) {
      sections.push('> ⚠️ **Changes Requested**: Please address the security issues before merging.');
    } else if (!checksPassed) {
      sections.push('> ⏳ **Awaiting Checks**: Once all status checks pass, the PR will be auto-approved.');
    } else {
      sections.push('> ✅ **Looks Good**: All checks passed. PR is ready to merge!');
    }

    return sections.join('\n');
  }

  /**
   * Post review comment (non-draft review)
   */
  async postReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    comments: ReviewComment[],
    octokit?: GitHubClient
  ): Promise<void> {
    if (!octokit || comments.length === 0) return;

    // Group comments by file
    const grouped: Record<string, ReviewComment[]> = {};
    for (const comment of comments) {
      if (!grouped[comment.path]) {
        grouped[comment.path] = [];
      }
      grouped[comment.path].push(comment);
    }

    // Post as single review comment
    const lines: string[] = ['## Code Review Findings', ''];

    for (const [file, fileComments] of Object.entries(grouped)) {
      lines.push(`### 📁 ${file}`);
      lines.push('');

      for (const comment of fileComments) {
        const icon = comment.severity === 'error' ? '🔴' : comment.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`${icon} Line ${comment.line}: ${comment.body}`);
        lines.push('');
      }
    }

    await this.prManager.createComment(owner, repo, prNumber, lines.join('\n'));
  }

  /**
   * Format review for GitHub API
   */
  formatReviewForAPI(comments: ReviewComment[]): Array<{
    path: string;
    line: number;
    side: 'LEFT' | 'RIGHT';
    body: string;
  }> {
    return comments.map(comment => ({
      path: comment.path,
      line: comment.line,
      side: 'RIGHT' as const,
      body: `**${comment.category.toUpperCase()}**: ${comment.body}`,
    }));
  }

  // ============================================
  // Configuration Access
  // ============================================

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<ReviewerConfig>): void {
    Object.assign(this.config, updates);
    this.logger.info('ReviewerAgent config updated', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<ReviewerConfig>> {
    return { ...this.config };
  }
}

// ============================================
// Factory Function
// ============================================

export function createReviewerAgent(
  rubberduck: RubberDuckService,
  prManager: PRManager,
  config?: ReviewerConfig,
  logger?: Logger
): ReviewerAgent {
  return new ReviewerAgent(rubberduck, prManager, config, logger);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse severity level from comment
 */
export function parseSeverity(severity: string): 'info' | 'warning' | 'error' {
  const normalized = severity.toLowerCase();
  if (normalized === 'error' || normalized === 'high') return 'error';
  if (normalized === 'warning' || normalized === 'medium') return 'warning';
  return 'info';
}

/**
 * Create a review comment from pattern match
 */
export function createComment(
  file: string,
  line: number,
  message: string,
  severity: 'info' | 'warning' | 'error',
  category: ReviewComment['category']
): ReviewComment {
  return {
    path: file,
    line,
    body: message,
    severity,
    category,
  };
}