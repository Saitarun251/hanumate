/**
 * CLI Package Tests
 * Tests for workflow-loader, parsePayload, error classes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parsePayload,
  isWorkflowResult,
  WorkflowLoaderError,
  WorkflowNotFoundError,
  WorkflowDirNotFoundError,
  InvalidWorkflowError,
  InvalidPayloadError,
  executeWorkflow,
} from '../src/utils/workflow-loader.js';

// Mock the runtime init function
vi.mock('@kishkindhalabs/hanumate-runtime', () => ({
  init: vi.fn(),
}));

// Mock fs operations for findWorkflowDir
const mockExistsSync = vi.fn();
vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
}));

describe('CLI Utils', () => {
  describe('parsePayload()', () => {
    it('should return empty object for empty or empty braces string', () => {
      expect(parsePayload('')).toEqual({});
      expect(parsePayload('{}')).toEqual({});
    });

    it('should parse valid JSON object', () => {
      const result = parsePayload('{"key": "value", "count": 42}');
      expect(result).toEqual({ key: 'value', count: 42 });
    });

    it('should parse nested JSON objects', () => {
      const result = parsePayload('{"user": {"name": "Alice", "age": 30}}');
      expect(result).toEqual({ user: { name: 'Alice', age: 30 } });
    });

    it('should throw InvalidPayloadError for JSON arrays (payload must be object)', () => {
      // Workflow payloads must be JSON objects, not arrays
      expect(() => parsePayload('["a", "b", "c"]')).toThrow(InvalidPayloadError);
    });

    it('should throw InvalidPayloadError for invalid JSON', () => {
      expect(() => parsePayload('not valid json')).toThrow(InvalidPayloadError);
      expect(() => parsePayload('{broken')).toThrow(InvalidPayloadError);
    });

    it('should throw InvalidPayloadError for non-object JSON (string)', () => {
      expect(() => parsePayload('"just a string"')).toThrow(InvalidPayloadError);
    });

    it('should throw InvalidPayloadError for non-object JSON (number)', () => {
      expect(() => parsePayload('123')).toThrow(InvalidPayloadError);
    });

    it('should throw InvalidPayloadError for null', () => {
      expect(() => parsePayload('null')).toThrow(InvalidPayloadError);
    });
  });

  describe('isWorkflowResult()', () => {
    it('should return true for valid WorkflowResult', () => {
      const result = { success: true, data: 'value' };
      expect(isWorkflowResult(result)).toBe(true);
    });

    it('should return true for failed WorkflowResult', () => {
      const result = { success: false, error: 'Something went wrong' };
      expect(isWorkflowResult(result)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isWorkflowResult(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isWorkflowResult(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isWorkflowResult('string')).toBe(false);
      expect(isWorkflowResult(123)).toBe(false);
      expect(isWorkflowResult(true)).toBe(false);
    });

    it('should return false for object without success field', () => {
      expect(isWorkflowResult({ data: 'value' })).toBe(false);
    });

    it('should return false for object with non-boolean success', () => {
      expect(isWorkflowResult({ success: 'yes' })).toBe(false);
      expect(isWorkflowResult({ success: 1 })).toBe(false);
    });
  });
});

describe('Workflow Error Classes', () => {
  describe('WorkflowLoaderError', () => {
    it('should create error with default EXECUTION_ERROR type', () => {
      const error = new WorkflowLoaderError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.errorType).toBe('EXECUTION_ERROR');
      expect(error.name).toBe('WorkflowLoaderError');
    });

    it('should accept custom error type', () => {
      const error = new WorkflowLoaderError('Test error', 'NOT_FOUND');
      expect(error.errorType).toBe('NOT_FOUND');
    });

    it('should be instance of Error', () => {
      const error = new WorkflowLoaderError('Test');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof WorkflowLoaderError).toBe(true);
    });
  });

  describe('WorkflowNotFoundError', () => {
    it('should create error with NOT_FOUND type', () => {
      const error = new WorkflowNotFoundError('my-workflow');
      expect(error.message).toContain('my-workflow');
      expect(error.message).toContain('not found');
      expect(error.errorType).toBe('NOT_FOUND');
      expect(error.name).toBe('WorkflowNotFoundError');
    });

    it('should include path when provided', () => {
      const error = new WorkflowNotFoundError('my-workflow', '/path/to/workflow.ts');
      expect(error.message).toContain('/path/to/workflow.ts');
    });
  });

  describe('WorkflowDirNotFoundError', () => {
    it('should create error with NOT_FOUND type', () => {
      const error = new WorkflowDirNotFoundError();
      expect(error.message).toContain('.hanumate/workflows');
      expect(error.errorType).toBe('NOT_FOUND');
      expect(error.name).toBe('WorkflowDirNotFoundError');
    });
  });

  describe('InvalidWorkflowError', () => {
    it('should create error with INVALID_WORKFLOW type', () => {
      const error = new InvalidWorkflowError('bad-workflow');
      expect(error.message).toContain('bad-workflow');
      expect(error.message).toContain('run()');
      expect(error.errorType).toBe('INVALID_WORKFLOW');
      expect(error.name).toBe('InvalidWorkflowError');
    });
  });

  describe('InvalidPayloadError', () => {
    it('should create error with VALIDATION_ERROR type', () => {
      const error = new InvalidPayloadError();
      expect(error.message).toContain('Invalid payload JSON');
      expect(error.errorType).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('InvalidPayloadError');
    });

    it('should include detail when provided', () => {
      const error = new InvalidPayloadError('Unexpected token');
      expect(error.message).toContain('Unexpected token');
    });
  });
});

describe('executeWorkflow()', () => {
  // We can't easily test the full workflow execution without mocking file system
  // But we can test the error handling paths

  it('should exist and be a function', () => {
    expect(typeof executeWorkflow).toBe('function');
  });
});