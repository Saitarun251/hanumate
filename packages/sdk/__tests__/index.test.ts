/**
 * SDK Package Tests
 * Tests for type definitions and client creation
 */

import { describe, it, expect } from 'vitest';
import {
  type AgentConnection,
  type WorkflowConnection,
  type HanumateClient,
  createClient,
} from '../src/index.js';

describe('Hanumate SDK', () => {
  describe('Type Definitions', () => {
    it('AgentConnection should have prompt method', () => {
      const mockConnection: AgentConnection = {
        prompt: async () => 'response',
        close: () => {},
      };
      
      expect(typeof mockConnection.prompt).toBe('function');
      expect(typeof mockConnection.close).toBe('function');
    });

    it('WorkflowConnection should have invoke method', () => {
      const mockConnection: WorkflowConnection = {
        invoke: async (payload) => payload,
      };
      
      expect(typeof mockConnection.invoke).toBe('function');
    });

    it('HanumateClient should have agents and workflows', () => {
      const mockClient: HanumateClient = {
        agents: {
          connect: async () => ({
            prompt: async () => '',
            close: () => {},
          }),
        },
        workflows: {
          connect: async () => ({
            invoke: async () => undefined,
          }),
        },
      };
      
      expect(typeof mockClient.agents.connect).toBe('function');
      expect(typeof mockClient.workflows.connect).toBe('function');
    });
  });

  describe('createClient()', () => {
    it('should be a function', () => {
      expect(typeof createClient).toBe('function');
    });

    it('should throw NotImplementedError when called', () => {
      expect(() => createClient({ baseUrl: 'http://localhost:3000' }))
        .toThrow('Not implemented yet');
    });

    it('should accept config with baseUrl', () => {
      expect(() => createClient({ baseUrl: 'http://api.example.com' }))
        .toThrow('Not implemented yet');
    });
  });
});