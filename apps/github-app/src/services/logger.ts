/**
 * Structured Logging Utility
 * JSON-formatted logs for production monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private service: string;
  private minLevel: LogLevel;
  private levels = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(service = 'github-app', minLevel: LogLevel = 'info') {
    this.service = service;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private format(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...meta,
    };
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(JSON.stringify(this.format('debug', message, meta)));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(JSON.stringify(this.format('info', message, meta)));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(JSON.stringify(this.format('warn', message, meta)));
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(JSON.stringify(this.format('error', message, meta)));
    }
  }

  child(additionalMeta: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger(this.service, this.minLevel);
    return child;
  }
}

// Create app-level logger
export const logger = new StructuredLogger('rubberduck-github-app');

// Metrics helper
export function logMetric(name: string, value: number, tags?: Record<string, string>): void {
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'metric',
      name,
      value,
      tags,
      service: 'rubberduck-github-app',
    }));
  }
}

// Health check endpoint
export function createHealthHandler() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'rubberduck-github-app',
    version: process.env.npm_package_version || '1.0.0',
  };
}