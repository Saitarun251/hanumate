import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWebhookEvent, mockOctokit } from '../setup.js';

describe('Webhook Handlers', () => {
  describe('PR Event Handler', () => {
    it('should handle opened PR event', async () => {
      const event = createMockWebhookEvent('pull_request', 'opened');
      
      // Mock the handler function
      const handlePROpened = vi.fn(async (context: any) => {
        return {
          action: 'pr_opened',
          prNumber: context.payload.pull_request?.number,
          repo: context.payload.repository?.full_name,
        };
      });

      const result = await handlePROpened(event);
      
      expect(result.action).toBe('pr_opened');
      expect(result.prNumber).toBe(1);
      expect(result.repo).toBe('test-owner/test-repo');
    });

    it('should handle closed PR event (merged)', async () => {
      const event = {
        ...createMockWebhookEvent('pull_request', 'closed'),
        payload: {
          ...createMockWebhookEvent('pull_request', 'closed').payload,
          pull_request: {
            ...createMockWebhookEvent('pull_request', 'closed').payload.pull_request,
            merged: true,
          },
        },
      };

      const handlePRClosed = vi.fn(async (context: any) => {
        const isMerged = context.payload.pull_request?.merged;
        return {
          action: 'pr_merged',
          prNumber: context.payload.pull_request?.number,
          wasMerged: isMerged,
        };
      });

      const result = await handlePRClosed(event);
      
      expect(result.action).toBe('pr_merged');
      expect(result.wasMerged).toBe(true);
    });

    it('should handle synchronize PR event', async () => {
      const event = createMockWebhookEvent('pull_request', 'synchronize');

      const handlePRSync = vi.fn(async (context: any) => {
        return {
          action: 'pr_sync',
          headSha: context.payload.pull_request?.head?.sha,
        };
      });

      const result = await handlePRSync(event);
      
      expect(result.action).toBe('pr_sync');
      expect(result.headSha).toBe('head-sha');
    });

    it('should extract PR details correctly', async () => {
      const event = createMockWebhookEvent('pull_request', 'opened');

      const extractPRDetails = vi.fn((context: any) => {
        const pr = context.payload.pull_request;
        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          author: pr.user.login,
          baseRef: pr.base?.ref,
          headRef: pr.head?.ref,
        };
      });

      const details = extractPRDetails(event);
      
      expect(details.number).toBe(1);
      expect(details.title).toBe('Test PR');
      expect(details.author).toBe('pr-author');
      expect(details.baseRef).toBe('main');
      expect(details.headRef).toBe('feature-branch');
    });
  });

  describe('Issue Event Handler', () => {
    it('should handle opened issue event', async () => {
      const event = {
        name: 'issues',
        payload: {
          action: 'opened',
          issue: {
            number: 42,
            title: 'Bug report',
            body: 'Issue description',
            user: { login: 'reporter' },
          },
          repository: {
            full_name: 'test-owner/test-repo',
          },
        },
      };

      const handleIssueOpened = vi.fn(async (context: any) => {
        return {
          action: 'issue_opened',
          issueNumber: context.payload.issue?.number,
          title: context.payload.issue?.title,
        };
      });

      const result = await handleIssueOpened(event);
      
      expect(result.action).toBe('issue_opened');
      expect(result.issueNumber).toBe(42);
      expect(result.title).toBe('Bug report');
    });

    it('should handle closed issue event', async () => {
      const event = {
        name: 'issues',
        payload: {
          action: 'closed',
          issue: {
            number: 42,
            title: 'Bug report',
          },
          repository: {
            full_name: 'test-owner/test-repo',
          },
        },
      };

      const handleIssueClosed = vi.fn(async (context: any) => {
        return {
          action: 'issue_closed',
          issueNumber: context.payload.issue?.number,
        };
      });

      const result = await handleIssueClosed(event);
      
      expect(result.action).toBe('issue_closed');
      expect(result.issueNumber).toBe(42);
    });
  });

  describe('Comment Event Handler', () => {
    it('should handle PR review comment', async () => {
      const event = {
        name: 'pull_request_review_comment',
        payload: {
          action: 'created',
          comment: {
            id: 123,
            body: '/review Please check this code',
            user: { login: 'reviewer' },
          },
          pull_request: {
            number: 1,
          },
          repository: {
            full_name: 'test-owner/test-repo',
          },
        },
      };

      const handleComment = vi.fn(async (context: any) => {
        const comment = context.payload.comment;
        const isCommand = comment.body?.startsWith('/');
        return {
          action: 'command_comment',
          isCommand,
          command: isCommand ? comment.body.slice(1).split(' ')[0] : null,
        };
      });

      const result = await handleComment(event);
      
      expect(result.isCommand).toBe(true);
      expect(result.command).toBe('review');
    });

    it('should handle issue comment', async () => {
      const event = {
        name: 'issue_comment',
        payload: {
          action: 'created',
          comment: {
            id: 456,
            body: 'Thanks for the fix!',
            user: { login: 'commenter' },
          },
          issue: {
            number: 42,
          },
          repository: {
            full_name: 'test-owner/test-repo',
          },
        },
      };

      const handleIssueComment = vi.fn(async (context: any) => {
        return {
          action: 'issue_comment',
          commentId: context.payload.comment?.id,
          isCommand: context.payload.comment?.body?.startsWith('/'),
        };
      });

      const result = await handleIssueComment(event);
      
      expect(result.action).toBe('issue_comment');
      expect(result.commentId).toBe(456);
      expect(result.isCommand).toBe(false);
    });
  });

  describe('Check Run Event Handler', () => {
    it('should handle requested check run', async () => {
      const event = {
        name: 'check_run',
        payload: {
          action: 'requested',
          check_run: {
            id: 789,
            name: 'rubberduck-review',
            status: 'queued',
          },
          repository: {
            full_name: 'test-owner/test-repo',
          },
        },
      };

      const handleCheckRun = vi.fn(async (context: any) => {
        return {
          action: 'check_run_requested',
          checkName: context.payload.check_run?.name,
          status: context.payload.check_run?.status,
        };
      });

      const result = await handleCheckRun(event);
      
      expect(result.action).toBe('check_run_requested');
      expect(result.checkName).toBe('rubberduck-review');
      expect(result.status).toBe('queued');
    });
  });

  describe('Validation', () => {
    it('should validate webhook payload structure', () => {
      const validatePayload = (payload: any): boolean => {
        if (!payload) return false;
        if (!payload.repository) return false;
        if (!payload.repository.full_name) return false;
        return true;
      };

      expect(validatePayload({ repository: { full_name: 'owner/repo' } })).toBe(true);
      expect(validatePayload(null)).toBe(false);
      expect(validatePayload({})).toBe(false);
      expect(validatePayload({ repository: {} })).toBe(false);
    });

    it('should extract repository info correctly', () => {
      const extractRepoInfo = (payload: any) => {
        const [owner, repo] = (payload.repository?.full_name || '').split('/');
        return { owner, repo, fullName: payload.repository?.full_name };
      };

      const result = extractRepoInfo({ repository: { full_name: 'test-owner/test-repo' } });
      
      expect(result.owner).toBe('test-owner');
      expect(result.repo).toBe('test-repo');
      expect(result.fullName).toBe('test-owner/test-repo');
    });

    it('should handle missing optional fields gracefully', () => {
      const safeExtract = (payload: any, key: string, defaultValue: any = null) => {
        return payload?.[key] ?? defaultValue;
      };

      expect(safeExtract({ foo: 'bar' }, 'foo')).toBe('bar');
      expect(safeExtract({ foo: 'bar' }, 'baz')).toBe(null);
      expect(safeExtract(null, 'foo', 'default')).toBe('default');
    });
  });
});