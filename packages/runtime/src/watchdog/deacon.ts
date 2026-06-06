/**
 * Deacon - Background Supervisor for Agent Health Monitoring
 *
 * The Deacon manages Witnesses and performs periodic patrol cycles to:
 * - Check all registered Witnesses for agent health
 * - Aggregate health reports from all witnesses
 * - Identify stalled or dead agents
 * - Dispatch Dogs for recovery of problematic agents
 *
 * Health hierarchy: healthy -> degraded -> stalled -> dead
 * The Deacon aggregates this into: healthy | degraded | critical
 */

import type {
  DeaconConfig,
  DeaconReport,
  DogTask,
  HealthStatus,
  WitnessReport,
} from './watchdog-types.js';
import {
  generateDeaconId,
  generateDogId,
} from './watchdog-types.js';
import type { Witness } from './witness.js';

/**
 * Full configuration with defaults applied
 */
interface DeaconFullConfig {
  id: string;
  name: string;
  patrolIntervalMs: number;
  maxTasksPerCycle: number;
  qualityThreshold: number;
  isActive: boolean;
  targetBeads: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Callback type for patrol cycle events
 */
export type PatrolCallback = (
  report: DeaconReport,
  reports: WitnessReport[]
) => void;

/**
 * Callback type for dog dispatch events
 */
export type DogDispatchCallback = (task: DogTask) => void;

/**
 * Callback type for health change events
 */
export type HealthChangeCallback = (
  oldHealth: 'healthy' | 'degraded' | 'critical',
  newHealth: 'healthy' | 'degraded' | 'critical',
  reports: WitnessReport[]
) => void;

/**
 * Pending task for a stalled/dead agent
 */
interface PendingTask {
  task: DogTask;
  agentId: string;
  createdAt: number;
}

/**
 * Create a new Deacon supervisor instance with default configuration
 */
function createDefaultConfig(partial?: Partial<DeaconConfig>): DeaconFullConfig {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const generateId = (prefix: string): string => {
    let id = prefix;
    for (let i = 0; i < 5; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  };

  return {
    id: partial?.id ?? generateId('dea-'),
    name: partial?.name ?? 'Deacon',
    patrolIntervalMs: partial?.patrolIntervalMs ?? 60000,
    maxTasksPerCycle: partial?.maxTasksPerCycle ?? 10,
    qualityThreshold: partial?.qualityThreshold ?? 0.8,
    isActive: partial?.isActive ?? true,
    targetBeads: partial?.targetBeads ?? [],
    metadata: partial?.metadata,
  };
}

/**
 * Deacon - Background supervisor for managing Witnesses
 *
 * Monitors agent health through registered Witnesses and dispatches
 * Dogs to recover stalled or dead agents.
 *
 * Health aggregation rules:
 * - healthy: all agents are healthy
 * - degraded: any agent is degraded (but none stalled/dead)
 * - critical: any agent is stalled or dead
 */
export class Deacon {
  private readonly config: DeaconFullConfig;
  private readonly witnesses: Map<string, Witness> = new Map();
  private readonly pendingTasks: Map<string, PendingTask> = new Map();
  private readonly patrolCallbacks: Set<PatrolCallback> = new Set();
  private readonly dogDispatchCallbacks: Set<DogDispatchCallback> = new Set();
  private readonly healthChangeCallbacks: Set<HealthChangeCallback> = new Set();

  private isRunning: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPatrolTime: number = 0;
  private lastHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  private patrolCount: number = 0;

  /**
   * Create a new Deacon supervisor
   * @param config - Optional configuration (uses defaults if not provided)
   */
  constructor(config?: Partial<DeaconConfig>) {
    this.config = createDefaultConfig(config);
  }

  // ===========================================================================
  // Witness Management
  // ===========================================================================

  /**
   * Register a Witness for an agent
   * @param agentId - ID of the agent to monitor
   * @param witness - Witness instance for health monitoring
   */
  register(agentId: string, witness: Witness): void {
    if (this.witnesses.has(agentId)) {
      // Already registered, update the witness
      console.warn(`Deacon: Witness already registered for agent ${agentId}, replacing`);
    }
    this.witnesses.set(agentId, witness);
  }

  /**
   * Unregister a Witness for an agent
   * @param agentId - ID of the agent to stop monitoring
   */
  unregister(agentId: string): void {
    const removed = this.witnesses.delete(agentId);
    if (removed) {
      // Also remove any pending tasks for this agent
      this.pendingTasks.delete(agentId);
    }
  }

  /**
   * Get all registered agent IDs
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.witnesses.keys());
  }

  /**
   * Get the number of registered witnesses
   */
  getWitnessCount(): number {
    return this.witnesses.size;
  }

  // ===========================================================================
  // Patrol Cycle
  // ===========================================================================

  /**
   * Run a patrol cycle - check all witnesses and aggregate health
   *
   * This is the core method that:
   * 1. Collects health reports from all registered witnesses
   * 2. Identifies stalled and dead agents
   * 3. Dispatches Dogs for recovery
   * 4. Returns an aggregated report
   *
   * @returns DeaconReport summarizing the patrol results
   */
  async patrol(): Promise<DeaconReport> {
    const now = Date.now();
    const reports: WitnessReport[] = [];
    const issues: string[] = [];
    let stalledCount = 0;
    let deadCount = 0;
    let degradedCount = 0;
    let healthyCount = 0;

    // Collect health reports from all witnesses
    for (const [agentId, witness] of this.witnesses) {
      const report = witness.getHealth();
      reports.push(report);

      // Categorize issues
      switch (report.healthStatus) {
        case 'stalled':
          stalledCount++;
          issues.push(`Agent ${agentId} (${report.details ?? 'stalled'})`);
          break;
        case 'dead':
          deadCount++;
          issues.push(`Agent ${agentId} is DEAD (${report.details ?? 'no response'})`);
          break;
        case 'degraded':
          degradedCount++;
          issues.push(`Agent ${agentId} is degraded (${report.details ?? 'slow response'})`);
          break;
        case 'healthy':
          healthyCount++;
          break;
      }

      // Dispatch dogs for stalled or dead agents
      if (report.healthStatus === 'stalled' || report.healthStatus === 'dead') {
        await this.dispatchRecoveryDog(agentId, report.healthStatus);
      }
    }

    // Update last patrol time
    this.lastPatrolTime = now;
    this.patrolCount++;

    // Build summary
    const summary = this.buildPatrolSummary(
      healthyCount,
      degradedCount,
      stalledCount,
      deadCount,
      reports.length
    );

    // Check for health change
    const currentHealth = this.getOverallHealth();
    if (currentHealth !== this.lastHealth) {
      const oldHealth = this.lastHealth;
      this.lastHealth = currentHealth;
      this.notifyHealthChange(oldHealth, currentHealth, reports);
    }

    // Create report
    const report: DeaconReport = {
      id: this.config.id,
      beadId: `patrol-${this.patrolCount}`,
      isCompleted: deadCount === 0 && stalledCount === 0,
      meetsStandards: currentHealth !== 'critical',
      timestamp: now,
      summary,
      issues: issues.length > 0 ? issues : undefined,
      confidence: this.calculateConfidence(reports.length, deadCount, stalledCount),
      metadata: {
        healthyCount,
        degradedCount,
        stalledCount,
        deadCount,
        totalWitnesses: reports.length,
        patrolNumber: this.patrolCount,
      },
    };

    // Notify patrol callbacks
    this.notifyPatrol(report, reports);

    return report;
  }

  /**
   * Build a human-readable patrol summary
   */
  private buildPatrolSummary(
    healthy: number,
    degraded: number,
    stalled: number,
    dead: number,
    total: number
  ): string {
    if (total === 0) {
      return 'No agents registered for monitoring.';
    }

    const parts: string[] = [];
    if (healthy > 0) parts.push(`${healthy} healthy`);
    if (degraded > 0) parts.push(`${degraded} degraded`);
    if (stalled > 0) parts.push(`${stalled} stalled`);
    if (dead > 0) parts.push(`${dead} dead`);

    if (dead > 0) {
      return `CRITICAL: ${parts.join(', ')}. Immediate recovery required.`;
    }
    if (stalled > 0) {
      return `DEGRADED: ${parts.join(', ')}. Recovery dogs dispatched.`;
    }
    if (degraded > 0) {
      return `OK: ${parts.join(', ')}. Minor issues detected.`;
    }
    return `ALL HEALTHY: ${healthy} agents reporting healthy.`;
  }

  /**
   * Calculate confidence level for the patrol report
   */
  private calculateConfidence(
    totalWitnesses: number,
    deadCount: number,
    stalledCount: number
  ): number {
    if (totalWitnesses === 0) return 1.0;

    // Confidence decreases with dead/stalled agents
    const penalty = (deadCount * 0.3 + stalledCount * 0.1) / totalWitnesses;
    return Math.max(0, Math.min(1, 1 - penalty));
  }

  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  /**
   * Start automatic patrol cycles
   *
   * Patrols will run at the configured interval (default: 60 seconds).
   * The first patrol runs immediately.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Run initial patrol immediately
    await this.patrol();

    // Schedule periodic patrols
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.patrol();
        } catch (error) {
          console.error('Deacon patrol cycle failed:', error);
        }
      }
    }, this.config.patrolIntervalMs);
  }

  /**
   * Stop automatic patrol cycles
   */
  async stop(): Promise<void> {
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
   * Check if the Deacon is currently running patrol cycles
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last patrol timestamp
   */
  getLastPatrolTime(): number {
    return this.lastPatrolTime;
  }

  /**
   * Get the number of patrols performed
   */
  getPatrolCount(): number {
    return this.patrolCount;
  }

  // ===========================================================================
  // Dog Dispatch
  // ===========================================================================

  /**
   * Dispatch a recovery Dog for a stalled or dead agent
   *
   * @param agentId - Agent that needs recovery
   * @param healthStatus - Current health status (stalled or dead)
   */
  private async dispatchRecoveryDog(
    agentId: string,
    healthStatus: 'stalled' | 'dead'
  ): Promise<void> {
    // Check if we already have a pending task for this agent
    if (this.pendingTasks.has(agentId)) {
      return; // Already dispatched
    }

    const task: DogTask = {
      id: generateDogId(),
      beadId: `recovery-${agentId}`,
      assignedAgentId: agentId,
      status: 'pending',
      createdAt: Date.now(),
      priority: healthStatus === 'dead' ? 'P0' : 'P1',
      description: `Recovery task for ${healthStatus} agent ${agentId}`,
      metadata: {
        originalHealthStatus: healthStatus,
        dispatchReason: 'deacon_patrol',
      },
    };

    await this.dispatchDog(task);
  }

  /**
   * Dispatch a Dog task for execution
   *
   * @param task - DogTask to dispatch
   */
  async dispatchDog(task: DogTask): Promise<void> {
    // Store pending task
    const pendingTask: PendingTask = {
      task: { ...task, status: 'assigned', assignedAt: Date.now() },
      agentId: task.assignedAgentId ?? 'unknown',
      createdAt: Date.now(),
    };

    if (task.assignedAgentId) {
      this.pendingTasks.set(task.assignedAgentId, pendingTask);
    }

    // Notify dog dispatch callbacks
    for (const callback of this.dogDispatchCallbacks) {
      try {
        callback(pendingTask.task);
      } catch (error) {
        console.error('Error in dog dispatch callback:', error);
      }
    }
  }

  /**
   * Get pending tasks for recovery
   */
  getPendingTasks(): DogTask[] {
    return Array.from(this.pendingTasks.values()).map((p) => p.task);
  }

  /**
   * Get pending task count
   */
  getPendingTaskCount(): number {
    return this.pendingTasks.size;
  }

  /**
   * Complete a pending task (call when Dog finishes)
   */
  completeTask(agentId: string): void {
    this.pendingTasks.delete(agentId);
  }

  // ===========================================================================
  // Health Status
  // ===========================================================================

  /**
   * Get overall system health status
   *
   * Aggregation rules:
   * - healthy: all agents healthy
   * - degraded: any agent degraded (but none stalled/dead)
   * - critical: any agent stalled or dead
   *
   * @returns Aggregated health status
   */
  getOverallHealth(): 'healthy' | 'degraded' | 'critical' {
    if (this.witnesses.size === 0) {
      return 'healthy'; // No agents to monitor = healthy
    }

    let hasCritical = false;
    let hasDegraded = false;

    for (const witness of this.witnesses.values()) {
      const report = witness.getHealth();

      if (report.healthStatus === 'stalled' || report.healthStatus === 'dead') {
        hasCritical = true;
        break; // Can't get worse than critical
      }

      if (report.healthStatus === 'degraded') {
        hasDegraded = true;
      }
    }

    if (hasCritical) return 'critical';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  /**
   * Get health reports from all witnesses
   */
  getAllReports(): WitnessReport[] {
    const reports: WitnessReport[] = [];
    for (const witness of this.witnesses.values()) {
      reports.push(witness.getHealth());
    }
    return reports;
  }

  /**
   * Get agents by health status
   */
  getAgentsByHealth(status: HealthStatus): string[] {
    const agents: string[] = [];
    for (const [agentId, witness] of this.witnesses) {
      if (witness.getHealth().healthStatus === status) {
        agents.push(agentId);
      }
    }
    return agents;
  }

  // ===========================================================================
  // Event Callbacks
  // ===========================================================================

  /**
   * Subscribe to patrol cycle events
   * @param callback - Function to call after each patrol
   * @returns Unsubscribe function
   */
  onPatrol(callback: PatrolCallback): () => void {
    this.patrolCallbacks.add(callback);
    return () => this.patrolCallbacks.delete(callback);
  }

  /**
   * Subscribe to dog dispatch events
   * @param callback - Function to call when a dog is dispatched
   * @returns Unsubscribe function
   */
  onDogDispatch(callback: DogDispatchCallback): () => void {
    this.dogDispatchCallbacks.add(callback);
    return () => this.dogDispatchCallbacks.delete(callback);
  }

  /**
   * Subscribe to health change events
   * @param callback - Function to call when overall health changes
   * @returns Unsubscribe function
   */
  onHealthChange(callback: HealthChangeCallback): () => void {
    this.healthChangeCallbacks.add(callback);
    return () => this.healthChangeCallbacks.delete(callback);
  }

  /**
   * Notify patrol callbacks
   */
  private notifyPatrol(report: DeaconReport, reports: WitnessReport[]): void {
    for (const callback of this.patrolCallbacks) {
      try {
        callback(report, reports);
      } catch (error) {
        console.error('Error in patrol callback:', error);
      }
    }
  }

  /**
   * Notify health change callbacks
   */
  private notifyHealthChange(
    oldHealth: 'healthy' | 'degraded' | 'critical',
    newHealth: 'healthy' | 'degraded' | 'critical',
    reports: WitnessReport[]
  ): void {
    for (const callback of this.healthChangeCallbacks) {
      try {
        callback(oldHealth, newHealth, reports);
      } catch (error) {
        console.error('Error in health change callback:', error);
      }
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the Deacon's configuration
   */
  getConfig(): Readonly<DeaconFullConfig> {
    return { ...this.config };
  }

  /**
   * Get the Deacon's ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.witnesses.clear();
    this.pendingTasks.clear();
    this.patrolCount = 0;
    this.lastPatrolTime = 0;
    this.lastHealth = 'healthy';
  }

  /**
   * Shutdown the Deacon completely
   */
  async shutdown(): Promise<void> {
    await this.stop();
    this.reset();
    this.patrolCallbacks.clear();
    this.dogDispatchCallbacks.clear();
    this.healthChangeCallbacks.clear();
  }
}

/**
 * Create a new Deacon supervisor instance
 * @param config - Optional configuration
 */
export function createDeacon(config?: Partial<DeaconConfig>): Deacon {
  return new Deacon(config);
}