/**
 * Mention Handler
 * Handles @mention events in issues, PRs, and comments
 */

import type { Logger, IssueCommentPayload } from '../types.js';
import type { RubberDuckService } from '../services/rubberduck.js';
import type { RepoManager } from '../services/repo-manager.js';

export interface MentionHandlerConfig {
  /** Bot usernames to respond to */
  botUsernames?: string[];
  /** Maximum mentions to process per minute */
  rateLimitPerMinute?: number;
  /** Respond to mentions in PRs */
  respondInPRs?: boolean;
  /** Respond to mentions in issues */
  respondInIssues?: boolean;
  /** Respond to mentions in comments */
  respondInComments?: boolean;
}

interface Comment {
  id: number;
  body: string;
  user: { login: string; id: number; type?: string };
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  pull_request?: object | null;
}

export class MentionHandler {
  private rubberduck: RubberDuckService;
  private _repoManager: RepoManager;
  private config: MentionHandlerConfig;
  private logger: Logger;
  private mentionCount: Map<string, number> = new Map();

  constructor(
    rubberduck: RubberDuckService,
    repoManager: RepoManager,
    config: MentionHandlerConfig = {},
    logger?: Logger
  ) {
    this.rubberduck = rubberduck;
    this._repoManager = repoManager;
    this.config = {
      botUsernames: ['rubberduck', 'rubberduck[bot]'],
      rateLimitPerMinute: 20,
      respondInPRs: true,
      respondInIssues: true,
      respondInComments: true,
      ...config,
    };
    this.logger = logger || console;
  }

  /**
   * Handle issue comment event (mentions)
   */
  async handleIssueComment(
    payload: IssueCommentPayload,
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    const { action, comment, issue, sender } = payload;
    const { owner, repo } = context;

    // Skip non-comment events
    if (action !== 'created' && action !== 'edited') {
      return;
    }

    // Skip bot comments
    if ((sender as { type?: string }).type === 'Bot' || (comment.user as { type?: string }).type === 'Bot') {
      this.logger.debug('Skipping bot-originated comment');
      return;
    }

    // Check if the comment mentions the bot
    const mentionedBot = this.extractMentions(comment.body).some(
      mention => this.isBotUsername(mention)
    );

    if (!mentionedBot) {
      return;
    }

    // Rate limiting
    const rateKey = `${owner}/${repo}`;
    if (!this.checkRateLimit(rateKey)) {
      this.logger.warn(`Rate limit exceeded for ${rateKey}`);
      return;
    }

    this.logger.info(`Bot mentioned in ${owner}/${repo}#${issue.number} by ${sender.login}`);

    // Determine context (issue or PR)
    const isPR = issue.pull_request !== null && issue.pull_request !== undefined;

    if (!isPR && !this.config.respondInIssues) {
      return;
    }
    if (isPR && !this.config.respondInPRs) {
      return;
    }

    // Extract task from comment
    const task = this.rubberduck.createTask({
      type: isPR ? 'pr' : 'issue',
      trigger: 'mention',
      owner,
      repo,
      context: {
        issueNumber: issue.number,
        commentId: comment.id,
        prNumber: isPR ? issue.number : undefined,
      },
      payload: {
        commentBody: comment.body,
        commentId: comment.id,
        commentAuthor: comment.user.login,
        mentionedBot: this.extractMentions(comment.body),
        issueTitle: issue.title,
        issueBody: issue.body,
        isPR,
      },
      priority: this.determinePriority(comment.body),
    });

    await this.rubberduck.submitTask(task);
  }

  /**
   * Handle PR review comment mentions
   */
  async handleReviewComment(
    payload: {
      action: string;
      comment: { body: string; user: { login: string; type: string } };
      pull_request: { number: number; title: string };
      repository: { name: string; full_name: string };
      sender: { login: string; type: string };
    },
    context: { owner: string; repo: string; installationId: number }
  ): Promise<void> {
    if (!this.config.respondInComments) return;

    const { action, comment, pull_request, sender } = payload;
    const { owner, repo } = context;

    if (action !== 'created') return;
    if ((sender as { type?: string }).type === 'Bot') return;

    const mentionedBot = this.extractMentions(comment.body).some(
      mention => this.isBotUsername(mention)
    );

    if (!mentionedBot) return;

    const task = this.rubberduck.createTask({
      type: 'pr',
      trigger: 'mention',
      owner,
      repo,
      context: { prNumber: pull_request.number },
      payload: {
        commentBody: comment.body,
        commentAuthor: comment.user.login,
        mentionedBot: this.extractMentions(comment.body),
        reviewContext: true,
      },
    });

    await this.rubberduck.submitTask(task);
  }

  /**
   * Check if a username is the bot
   */
  private isBotUsername(username: string): boolean {
    const normalized = username.toLowerCase().replace(/^@/, '');
    return this.config.botUsernames!.some(
      bot => bot.toLowerCase() === normalized || bot.toLowerCase().replace(/\[bot\]/, '') === normalized
    );
  }

  /**
   * Extract @mentions from text
   */
  private extractMentions(text: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9][-a-zA-Z0-9]*)(\[bot\])?/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[0]);
    }

    return mentions;
  }

  /**
   * Check rate limit for a repo
   */
  private checkRateLimit(key: string): boolean {
    const now = Date.now();

    // Clean and reset if window expired
    const lastReset = this.mentionCount.get(`${key}:reset`) || 0;
    if (now - lastReset > 60000) {
      this.mentionCount.set(key, 0);
      this.mentionCount.set(`${key}:reset`, now);
    }

    const count = this.mentionCount.get(key) || 0;
    if (count >= (this.config.rateLimitPerMinute || 20)) {
      return false;
    }

    this.mentionCount.set(key, count + 1);
    return true;
  }

  /**
   * Determine task priority from comment content
   */
  private determinePriority(commentBody: string): 'low' | 'normal' | 'high' {
    const body = commentBody.toLowerCase();

    if (body.includes('urgent') || body.includes('asap') || body.includes('critical')) {
      return 'high';
    }
    if (body.includes('when you get a chance') || body.includes('when possible') || body.includes('low priority')) {
      return 'low';
    }
    return 'normal';
  }

  /**
   * Build mention response message
   */
  buildMentionResponse(taskId: string): string {
    return `Thanks for the mention! I've started working on your request.

**Task ID:** \`${taskId}\`

I'll update this thread when the task is complete. Feel free to add more details if needed!`;
  }
}

/**
 * Factory function to create MentionHandler
 */
export function createMentionHandler(
  rubberduck: RubberDuckService,
  repoManager: RepoManager,
  config?: MentionHandlerConfig,
  logger?: Logger
): MentionHandler {
  return new MentionHandler(rubberduck, repoManager, config, logger);
}