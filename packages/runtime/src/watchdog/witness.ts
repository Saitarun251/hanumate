/**
 * Witness - Health Monitor for Agents
 * 
 * Monitors a single agent's health based on heartbeats, progress updates,
 * and error tracking. Follows the ROADMAP-v2.md health status system.
 */

import type { 
  WitnessConfig, 
  WitnessReport, 
  HealthStatus,
  WitnessId 
} from './watchdog-types.js';

// Health threshold constants (in milliseconds)
const HEALTHY_THRESHOLD_MS = 60_000;      // 60 seconds
const DEGRADED_THRESHOLD_MS = 120_000;  // 2 minutes
const STALLED_THRESHOLD_MS = 300_000;   // 5 minutes

// Error count thresholds
const DEGRADED_ERROR_COUNT = 1;          // 1-3 errors = degraded
const STALLED_ERROR_COUNT = 4;          // 4 errors (transitioning)
const DEAD_ERROR_COUNT = 5;             // > 5 errors = dead

/**
 * Witness configuration for monitoring an agent
 */
export interface WitnessConfigOptions {
  /** Unique identifier for the witness */
  id: WitnessId;
  /** Human-readable name for the witness */
  name: string;
  /** ID of the agent being monitored */
  agentId: string;
  /** Interval in milliseconds between health checks (default: 30000) */
  checkIntervalMs?: number;
}

/**
 * Witness - Health monitor for a single agent
 * 
 * Tracks heartbeat, progress, and errors to determine agent health status.
 * Health thresholds:
 * - healthy: heartbeat < 60s, no errors
 * - degraded: heartbeat < 120s OR 1-3 errors
 * - stalled: heartbeat < 300s, progress not updating
 * - dead: no heartbeat > 300s OR > 5 errors
 */
export class Witness {
  private readonly config: Required<WitnessConfigOptions>;
  private isRunning: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  
  // Health tracking state
  private lastHeartbeat: number;
  private lastProgressUpdate: number;
  private currentProgress: number = 0;
  private errorCount: number = 0;
  private recentErrors: Array<{ timestamp: number; message: string }> = [];

  constructor(config: WitnessConfigOptions) {
    this.config = {
      id: config.id,
      name: config.name,
      agentId: config.agentId,
      checkIntervalMs: config.checkIntervalMs ?? 30_000,
    };
    
    // Initialize timestamps to current time (agent starts healthy)
    const now = Date.now();
    this.lastHeartbeat = now;
    this.lastProgressUpdate = now;
  }

  /**
   * Get the witness ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get the agent ID being monitored
   */
  getAgentId(): string {
    return this.config.agentId;
  }

  /**
   * Record a heartbeat from the monitored agent
   */
  recordHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Record progress update from the monitored agent
   * @param progress - Progress percentage 0-100
   */
  recordProgress(progress: number): void {
    // Clamp progress to 0-100 range
    this.currentProgress = Math.max(0, Math.min(100, progress));
    this.lastProgressUpdate = Date.now();
  }

  /**
   * Record an error from the monitored agent
   * @param error - Error that occurred
   */
  recordError(error: Error): void {
    this.errorCount++;
    this.recentErrors.push({
      timestamp: Date.now(),
      message: error.message || error.toString(),
    });
    
    // Keep only last 10 errors for reporting
    if (this.recentErrors.length > 10) {
      this.recentErrors.shift();
    }
  }

  /**
   * Get the current health report for the monitored agent
   */
  getHealth(): WitnessReport {
    const now = Date.now();
    const secondsSinceHeartbeat = (now - this.lastHeartbeat) / 1000;
    const secondsSinceProgress = (now - this.lastProgressUpdate) / 1000;
    
    const healthStatus = this.calculateHealthStatus(
      secondsSinceHeartbeat,
      secondsSinceProgress,
      this.errorCount
    );
    
    return {
      id: this.config.id,
      agentId: this.config.agentId,
      healthStatus,
      timestamp: now,
      isResponsive: secondsSinceHeartbeat < STALLED_THRESHOLD_MS / 1000,
      lastActivityAt: this.lastHeartbeat,
      failedChecks: this.errorCount,
      details: this.buildHealthDetails(healthStatus, secondsSinceHeartbeat),
      metadata: {
        name: this.config.name,
        currentProgress: this.currentProgress,
        lastProgressUpdate: this.lastProgressUpdate,
        recentErrors: this.recentErrors.slice(-5),
      },
    };
  }

  /**
   * Check if the agent is healthy
   * @returns true if status is 'healthy'
   */
  isHealthy(): boolean {
    return this.getHealth().healthStatus === 'healthy';
  }

  /**
   * Check if the agent is stalled
   * @returns true if status is 'stalled'
   */
  isStalled(): boolean {
    return this.getHealth().healthStatus === 'stalled';
  }

  /**
   * Check if the agent is dead
   * @returns true if status is 'dead'
   */
  isDead(): boolean {
    return this.getHealth().healthStatus === 'dead';
  }

  /**
   * Start the witness monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Set up periodic health checks
    this.intervalId = setInterval(() => {
      // Health check is passive - just reports on current state
      // Actual health determination happens in getHealth()
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the witness monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Reset the witness state
   */
  reset(): void {
    const now = Date.now();
    this.lastHeartbeat = now;
    this.lastProgressUpdate = now;
    this.currentProgress = 0;
    this.errorCount = 0;
    this.recentErrors = [];
  }

  /**
   * Calculate health status based on heartbeat, progress, and error metrics
   */
  private calculateHealthStatus(
    secondsSinceHeartbeat: number,
    secondsSinceProgress: number,
    errorCount: number
  ): HealthStatus {
    // Dead if no heartbeat for > 300s OR > 5 errors
    if (secondsSinceHeartbeat > STALLED_THRESHOLD_MS / 1000 || errorCount > DEAD_ERROR_COUNT) {
      return 'dead';
    }
    
    // Stalled if heartbeat < 300s but progress not updating
    if (secondsSinceHeartbeat > DEGRADED_THRESHOLD_MS / 1000 && 
        secondsSinceProgress > STALLED_THRESHOLD_MS / 1000) {
      return 'stalled';
    }
    
    // Degraded if heartbeat < 120s OR 1-3 errors
    if (secondsSinceHeartbeat > HEALTHY_THRESHOLD_MS / 1000 || 
        (errorCount >= DEGRADED_ERROR_COUNT && errorCount <= 3)) {
      return 'degraded';
    }
    
    // Healthy: heartbeat < 60s and no errors
    return 'healthy';
  }

  /**
   * Build human-readable health details
   */
  private buildHealthDetails(status: HealthStatus, secondsSinceHeartbeat: number): string {
    const heartbeatAge = Math.round(secondsSinceHeartbeat);
    
    switch (status) {
      case 'healthy':
        return `${this.config.name} is healthy. Last heartbeat ${heartbeatAge}s ago.`;
      case 'degraded':
        return `${this.config.name} is degraded. Last heartbeat ${heartbeatAge}s ago. ${this.errorCount} error(s) recorded.`;
      case 'stalled':
        return `${this.config.name} is stalled. Last heartbeat ${heartbeatAge}s ago. Progress not updating. ${this.errorCount} error(s).`;
      case 'dead':
        return `${this.config.name} is dead. Last heartbeat ${heartbeatAge}s ago. ${this.errorCount} error(s).`;
    }
  }
}

/**
 * Create a new Witness instance
 */
export function createWitness(config: WitnessConfigOptions): Witness {
  return new Witness(config);
}