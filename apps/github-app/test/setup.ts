import { vi } from 'vitest';

// Mock environment setup
process.env.GITHUB_APP_ID = '123456';
process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GITHUB_TOKEN = 'test-token';

// Global test utilities
export const createMockContext = () => ({
  repo: {
    owner: 'test-owner',
    repo: 'test-repo',
  },
  payload: {
    action: 'opened',
    pull_request: {
      number: 1,
      title: 'Test PR',
      body: 'Test PR body',
      user: { login: 'test-user' },
      base: { sha: 'base-sha' },
      head: { sha: 'head-sha' },
    },
  },
  issue: {
    number: 1,
    owner: 'test-owner',
    repo: 'test-repo',
  },
  comment: {
    id: 1,
    body: 'Test comment',
    user: { login: 'commenter' },
  },
});

export const createMockWebhookEvent = (type: string, action: string = 'opened') => ({
  name: type,
  payload: {
    action,
    repository: {
      id: 12345,
      name: 'test-repo',
      full_name: 'test-owner/test-repo',
      owner: { login: 'test-owner' },
    },
    pull_request: {
      number: 1,
      title: 'Test PR',
      body: 'Test description',
      state: 'open',
      user: { login: 'pr-author' },
      base: { ref: 'main', sha: 'base-sha' },
      head: { ref: 'feature-branch', sha: 'head-sha' },
    },
  },
});

export const mockOctokit = {
  issues: {
    createComment: vi.fn().mockResolvedValue({ data: { id: 1, body: 'Comment created' } }),
    updateComment: vi.fn().mockResolvedValue({ data: { id: 1, body: 'Comment updated' } }),
    deleteComment: vi.fn().mockResolvedValue({ status: 204 }),
  },
  pulls: {
    get: vi.fn().mockResolvedValue({
      data: {
        number: 1,
        title: 'Test PR',
        body: 'PR body',
        state: 'open',
        base: { sha: 'base-sha' },
        head: { sha: 'head-sha' },
        user: { login: 'author' },
      },
    }),
    createReview: vi.fn().mockResolvedValue({ data: { id: 1, state: 'approved' } }),
    requestReviewers: vi.fn().mockResolvedValue({ data: { users: [] } }),
  },
  repos: {
    getContent: vi.fn().mockResolvedValue({ data: [] }),
    compareCommits: vi.fn().mockResolvedValue({
      data: {
        commits: [],
        files: [],
      },
    }),
  },
  checks: {
    create: vi.fn().mockResolvedValue({ data: { id: 1, status: 'queued' } }),
    update: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  },
};