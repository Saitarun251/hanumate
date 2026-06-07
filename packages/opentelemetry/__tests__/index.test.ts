/**
 * OpenTelemetry Package Tests
 * Tests for setup, shutdown, getTracer, wrapAsync, wrapSync functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock OpenTelemetry modules before importing
vi.mock('@opentelemetry/sdk-trace-node', () => {
  return {
    NodeTracerProvider: vi.fn().mockImplementation(function() {
      return {
        addSpanProcessor: vi.fn(),
        register: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock('@opentelemetry/sdk-trace-base', () => {
  return {
    ConsoleSpanExporter: vi.fn(),
    BatchSpanProcessor: vi.fn().mockImplementation(function() {
      return {
        onStart: vi.fn(),
        onEnd: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => {
  return {
    OTLPTraceExporter: vi.fn(),
  };
});

vi.mock('@opentelemetry/resources', () => {
  return {
    Resource: function() {
      return {};
    },
  };
});

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

// Mock the global trace object
const mockTracer = {
  startSpan: vi.fn().mockReturnValue({
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  }),
  startActiveSpan: vi.fn().mockImplementation(async (name: string, fn: (span: any) => Promise<any>) => {
    const span = {
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };
    return fn(span);
  }),
};

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue(mockTracer),
  },
  SpanKind: { INTERNAL: 0 },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('Hanumate OpenTelemetry', () => {
  let setup: any;
  let shutdown: any;
  let isSetup: any;
  let getTracer: any;
  let wrapAsync: any;
  let wrapSync: any;

  beforeEach(async () => {
    // Reset module cache
    vi.resetModules();
    
    const otel = await import('../src/index.js');
    setup = otel.setup;
    shutdown = otel.shutdown;
    isSetup = otel.isSetup;
    getTracer = otel.getTracer;
    wrapAsync = otel.wrapAsync;
    wrapSync = otel.wrapSync;
  });

  afterEach(async () => {
    try {
      await shutdown();
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('setup()', () => {
    it('should initialize with default config', () => {
      const tracer = setup();
      expect(tracer).toBeDefined();
      expect(isSetup()).toBe(true);
    });

    it('should accept custom service name', () => {
      const tracer = setup({ serviceName: 'my-agent' });
      expect(tracer).toBeDefined();
      expect(isSetup()).toBe(true);
    });

    it('should accept custom service version', () => {
      const tracer = setup({ serviceVersion: '2.0.0' });
      expect(tracer).toBeDefined();
      expect(isSetup()).toBe(true);
    });

    it('should accept all config options', () => {
      const tracer = setup({
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        consoleExporter: true,
        otlpExporter: false,
        sampleRatio: 0.5,
      });
      expect(tracer).toBeDefined();
    });

    it('should warn if called twice', () => {
      setup();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      setup();
      
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('shutdown()', () => {
    it('should cleanup provider on shutdown', async () => {
      setup();
      expect(isSetup()).toBe(true);
      
      await shutdown();
      
      expect(isSetup()).toBe(false);
    });

    it('should be safe to call when not initialized', async () => {
      await shutdown(); // Should not throw
      expect(isSetup()).toBe(false);
    });

    it('should allow re-initialization after shutdown', async () => {
      setup();
      await shutdown();
      
      const tracer = setup();
      expect(tracer).toBeDefined();
      expect(isSetup()).toBe(true);
    });
  });

  describe('isSetup()', () => {
    it('should return false before setup', () => {
      expect(isSetup()).toBe(false);
    });

    it('should return true after setup', () => {
      setup();
      expect(isSetup()).toBe(true);
    });

    it('should return false after shutdown', async () => {
      setup();
      await shutdown();
      expect(isSetup()).toBe(false);
    });
  });

  describe('getTracer()', () => {
    it('should return a tracer instance', () => {
      setup();
      const tracer = getTracer('test');
      expect(tracer).toBeDefined();
    });

    it('should return tracer with name', () => {
      setup();
      const tracer = getTracer('session-manager');
      expect(tracer).toBeDefined();
    });
  });

  describe('wrapAsync()', () => {
    it('should execute async function and return result', async () => {
      setup();
      const tracer = getTracer('test');
      
      const result = await wrapAsync(tracer, 'test-operation', async () => {
        return 'success';
      });
      
      expect(result).toBe('success');
    });

    it('should propagate errors from async function', async () => {
      setup();
      const tracer = getTracer('test');
      
      await expect(
        wrapAsync(tracer, 'failing-operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should work with promise that resolves to object', async () => {
      setup();
      const tracer = getTracer('test');
      
      const result = await wrapAsync(tracer, 'data-operation', async () => {
        return { data: 'value', count: 42 };
      });
      
      expect(result).toBeDefined();
      expect(result.data).toBe('value');
      expect(result.count).toBe(42);
    });
  });

  describe('wrapSync()', () => {
    it('should execute sync function and return result', async () => {
      setup();
      const tracer = getTracer('test');
      
      const result = await wrapSync(tracer, 'sync-operation', () => {
        return 'sync-success';
      });
      
      expect(result).toBe('sync-success');
    });

    it('should propagate errors from sync function', async () => {
      setup();
      const tracer = getTracer('test');
      
      await expect(
        wrapSync(tracer, 'failing-sync', () => {
          throw new Error('Sync error');
        })
      ).rejects.toThrow('Sync error');
    });

    it('should work with synchronous computations', async () => {
      setup();
      const tracer = getTracer('test');
      
      const result = await wrapSync(tracer, 'compute', () => {
        return 1 + 2 + 3;
      });
      
      expect(result).toBe(6);
    });
  });
});