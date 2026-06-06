/**
 * Dogs - Infrastructure Helper Functions for Watchdog System
 * 
 * Pure functions that execute monitoring and maintenance tasks:
 * - runBootDog: Validates Deacon health on startup
 * - runCleanupDog: Cleans stale/expired sessions
 * - runHealthDog: Aggregates Witness reports into detailed health analysis
 * 
 * Each dog returns structured results with error handling and composability.
 */

import type { 
  DeaconConfig,
  HealthStatus,
  WitnessReport,
} from '../watchdog-types.js';
import type { SessionStore } from '../../session-store.js';

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Result from a dog operation
 */
export interface DogResult<T = void> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Timestamp when the operation ran */
  timestamp: number;
  /** Error message if failed */
  error?: string;
  /** Data returned by the operation */
  data?: T;
}

/**
 * Composable result that can be chained with other dogs
 */
export interface ComposableDogResult<T = void> extends DogResult<T> {
  /** Logs from the operation */
  logs: string[];
  /** Warnings encountered */
  warnings: string[];
  /** Add a log entry */
  addLog(message: string): ComposableDogResult<T>;
  /** Add a warning */
  addWarning(message: string): ComposableDogResult<T>;
}

/**
 * Create a composable result with fluent API
 */
function createComposableResult<T>(partial: Partial<ComposableDogResult<T>> = {}): ComposableDogResult<T> {
  const logs: string[] = partial.logs ?? [];
  const warnings: string[] = partial.warnings ?? [];
  
  const result: ComposableDogResult<T> = {
    success: partial.success ?? false,
    timestamp: partial.timestamp ?? Date.now(),
    error: partial.error,
    data: partial.data,
    logs,
    warnings,
    addLog(message: string): ComposableDogResult<T> {
      logs.push(message);
      return result;
    },
    addWarning(message: string): ComposableDogResult<T> {
      warnings.push(message);
      return result;
    },
  };
  
  return result;
}

// ============================================================================
// Boot Dog - Checks Deacon Health
// ============================================================================

/**
 * BootDogOptions - Configuration for boot dog
 */
export interface BootDogOptions {
  /** Optional timeout for health checks (ms) */
  timeoutMs?: number;
  /** Required health status threshold */
  minStatus?: HealthStatus;
}

/**
 * BootDogReport - Result from boot dog check
 */
export interface BootDogReport {
  /** Whether the deacon passed all checks */
  isReady: boolean;
  /** Health status of the deacon */
  healthStatus: HealthStatus;
  /** Checks performed and their results */
  checks: BootCheck[];
  /** Summary message */
  summary: string;
}

/**
 * Individual check performed during boot
 */
export interface BootCheck {
  /** Name of the check */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Details about the check */
  details?: string;
  /** Error if check failed */
  error?: string;
}

/**
 * Run the Boot Dog - validates Deacon is healthy and ready on startup
 * 
 * Performs health checks:
 * 1. Configuration validation
 * 2. Health status verification
 * 3. Required capabilities check
 * 
 * @param deacon - Deacon configuration to check
 * @param options - Optional boot dog configuration
 * @returns Structured result with boot report
 * 
 * @example
 * ```typescript
 * const result = runBootDog(deaconConfig, { minStatus: 'healthy' });
 * if (!result.success || !result.data?.isReady) {
 *   console.error('Deacon not ready:', result.data?.summary);
 * }
 * ```
 */
export function runBootDog(
  deacon: DeaconConfig,
  options: BootDogOptions = {}
): DogResult<BootDogReport> {
  const timestamp = Date.now();
  const checks: BootCheck[] = [];
  
  try {
    // Check 1: Validate deacon configuration
    const configCheck = validateDeaconConfig(deacon);
    checks.push(configCheck);
    
    if (!configCheck.passed) {
      return createComposableResult({
        success: false,
        timestamp,
        error: `Configuration validation failed: ${configCheck.error}`,
        data: {
          isReady: false,
          healthStatus: 'dead' as HealthStatus,
          checks,
          summary: `Boot failed: ${configCheck.error}`,
        },
      });
    }
    
    // Check 2: Verify deacon is active
    const activeCheck = checkDeaconActive(deacon);
    checks.push(activeCheck);
    
    // Check 3: Verify patrol interval is reasonable
    const intervalCheck = checkPatrolInterval(deacon);
    checks.push(intervalCheck);
    
    // Check 4: Verify quality threshold
    const thresholdCheck = checkQualityThreshold(deacon);
    checks.push(thresholdCheck);
    
    // Determine overall health status
    const failedChecks = checks.filter(c => !c.passed);
    const healthStatus = failedChecks.length > 0 
      ? (failedChecks.length >= 2 ? 'dead' : 'degraded')
      : 'healthy';
    
    // Check if meets minimum status requirement
    const minStatusOrder: Record<HealthStatus, number> = {
      healthy: 4,
      degraded: 3,
      stalled: 2,
      dead: 1,
    };
    
    const meetsMinStatus = minStatusOrder[healthStatus] >= minStatusOrder[options.minStatus ?? 'degraded'];
    const isReady = activeCheck.passed && meetsMinStatus;
    
    const summary = isReady
      ? `Deacon '${deacon.name}' (${deacon.id}) is ready. All ${checks.length} checks passed.`
      : `Deacon '${deacon.name}' (${deacon.id}) not ready. ${failedChecks.length} check(s) failed.`;
    
    return createComposableResult({
      success: true,
      timestamp,
      data: {
        isReady,
        healthStatus,
        checks,
        summary,
      },
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createComposableResult({
      success: false,
      timestamp,
      error: `Boot dog error: ${errorMessage}`,
      data: {
        isReady: false,
        healthStatus: 'dead' as HealthStatus,
        checks,
        summary: `Boot failed with error: ${errorMessage}`,
      },
    });
  }
}

/**
 * Validate deacon configuration
 */
function validateDeaconConfig(deacon: DeaconConfig): BootCheck {
  if (!deacon.id || !deacon.id.startsWith('dea-')) {
    return {
      name: 'config_validation',
      passed: false,
      error: 'Invalid deacon ID format (expected: dea-xxxxx)',
    };
  }
  
  if (!deacon.name || deacon.name.trim().length === 0) {
    return {
      name: 'config_validation',
      passed: false,
      error: 'Deacon name is required',
    };
  }
  
  return {
    name: 'config_validation',
    passed: true,
    details: `Deacon ID: ${deacon.id}, Name: ${deacon.name}`,
  };
}

/**
 * Check if deacon is active
 */
function checkDeaconActive(deacon: DeaconConfig): BootCheck {
  return {
    name: 'deacon_active',
    passed: deacon.isActive,
    details: deacon.isActive ? 'Deacon is active' : 'Deacon is inactive',
    error: deacon.isActive ? undefined : 'Deacon must be active for boot',
  };
}

/**
 * Check if patrol interval is reasonable
 */
function checkPatrolInterval(deacon: DeaconConfig): BootCheck {
  const minInterval = 10_000;  // 10 seconds minimum
  const maxInterval = 3_600_000; // 1 hour maximum
  
  if (deacon.patrolIntervalMs < minInterval) {
    return {
      name: 'patrol_interval',
      passed: false,
      error: `Patrol interval ${deacon.patrolIntervalMs}ms is too short (min: ${minInterval}ms)`,
    };
  }
  
  if (deacon.patrolIntervalMs > maxInterval) {
    return {
      name: 'patrol_interval',
      passed: false,
      error: `Patrol interval ${deacon.patrolIntervalMs}ms is too long (max: ${maxInterval}ms)`,
    };
  }
  
  return {
    name: 'patrol_interval',
    passed: true,
    details: `Patrol interval: ${deacon.patrolIntervalMs}ms`,
  };
}

/**
 * Check if quality threshold is valid
 */
function checkQualityThreshold(deacon: DeaconConfig): BootCheck {
  if (deacon.qualityThreshold < 0 || deacon.qualityThreshold > 1) {
    return {
      name: 'quality_threshold',
      passed: false,
      error: `Quality threshold ${deacon.qualityThreshold} must be between 0 and 1`,
    };
  }
  
  return {
    name: 'quality_threshold',
    passed: true,
    details: `Quality threshold: ${deacon.qualityThreshold}`,
  };
}

// ============================================================================
// Cleanup Dog - Cleans Stale Sessions
// ============================================================================

/**
 * CleanupDogOptions - Configuration for cleanup dog
 */
export interface CleanupDogOptions {
  /** Session store to clean */
  sessionStore: SessionStore;
  /** Maximum age for sessions in milliseconds (default: 7 days) */
  maxAgeMs?: number;
  /** Maximum number of sessions to clean per run (default: 100) */
  batchSize?: number;
  /** If true, only report what would be cleaned without actually cleaning */
  dryRun?: boolean;
  /** Optional filter for specific session IDs to clean */
  sessionIds?: string[];
  /** If true, include expired but not yet cleaned sessions */
  includeExpired?: boolean;
}

/**
 * CleanupDogReport - Result from cleanup dog operation
 */
export interface CleanupDogReport {
  /** Total sessions scanned */
  totalScanned: number;
  /** Sessions that were cleaned/deleted */
  cleaned: number;
  /** Sessions that were skipped */
  skipped: number;
  /** Sessions that had errors */
  errors: number;
  /** List of cleaned session IDs */
  cleanedIds: string[];
  /** List of errors encountered */
  errorDetails: CleanupError[];
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Summary message */
  summary: string;
}

/**
 * Error details for a failed cleanup
 */
export interface CleanupError {
  /** Session ID that failed */
  sessionId: string;
  /** Error message */
  message: string;
  /** Timestamp of the error */
  timestamp: number;
}

/**
 * Run the Cleanup Dog - removes stale/expired sessions
 * 
 * This is a pure function that can be run periodically to clean up
 * old sessions from the session store.
 * 
 * @param options - Cleanup configuration
 * @returns Structured result with cleanup report
 * 
 * @example
 * ```typescript
 * const result = await runCleanupDog({
 *   sessionStore: mySessionStore,
 *   maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
 *   dryRun: false,
 * });
 * console.log(`Cleaned ${result.data?.cleaned} sessions`);
 * ```
 */
export async function runCleanupDog(
  options: CleanupDogOptions
): Promise<DogResult<CleanupDogReport>> {
  const timestamp = Date.now();
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000; // Default: 7 days
  const batchSize = options.batchSize ?? 100;
  const dryRun = options.dryRun ?? false;
  
  let totalScanned = 0;
  let cleaned = 0;
  let skipped = 0;
  let errors = 0;
  const cleanedIds: string[] = [];
  const errorDetails: CleanupError[] = [];
  
  try {
    // Get list of sessions to process
    const sessionIds = options.sessionIds ?? await options.sessionStore.list();
    totalScanned = sessionIds.length;
    
    // Process in batches
    const toProcess = sessionIds.slice(0, batchSize);
    
    for (const sessionId of toProcess) {
      try {
        const shouldClean = await shouldCleanSession(
          sessionId,
          options.sessionStore,
          maxAgeMs,
          options.includeExpired ?? true
        );
        
        if (!shouldClean) {
          skipped++;
          continue;
        }
        
        if (dryRun) {
          // Dry run: just record what would be cleaned
          cleaned++;
          cleanedIds.push(sessionId);
        } else {
          // Actually clean
          await options.sessionStore.delete(sessionId);
          cleaned++;
          cleanedIds.push(sessionId);
        }
      } catch (error) {
        errors++;
        errorDetails.push({
          sessionId,
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }
    }
    
    const summary = dryRun
      ? `Dry run: would clean ${cleaned} of ${totalScanned} sessions`
      : `Cleaned ${cleaned} of ${totalScanned} sessions. ${errors} errors.`;
    
    return createComposableResult({
      success: errors === 0,
      timestamp,
      error: errors > 0 ? `${errors} session(s) failed to clean` : undefined,
      data: {
        totalScanned,
        cleaned,
        skipped,
        errors,
        cleanedIds,
        errorDetails,
        dryRun,
        summary,
      },
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createComposableResult({
      success: false,
      timestamp,
      error: `Cleanup dog error: ${errorMessage}`,
      data: {
        totalScanned,
        cleaned,
        skipped,
        errors,
        cleanedIds,
        errorDetails,
        dryRun,
        summary: `Cleanup failed: ${errorMessage}`,
      },
    });
  }
}

/**
 * Determine if a session should be cleaned
 */
async function shouldCleanSession(
  sessionId: string,
  store: SessionStore,
  maxAgeMs: number,
  includeExpired: boolean
): Promise<boolean> {
  const sessionData = await store.load(sessionId);
  
  if (!sessionData) {
    // Session doesn't exist or already expired
    return includeExpired;
  }
  
  // Check if session has expired
  if (sessionData.expiresAt && sessionData.expiresAt < Date.now()) {
    return true;
  }
  
  // Check if session is older than max age
  const age = Date.now() - sessionData.updatedAt;
  if (age > maxAgeMs) {
    return true;
  }
  
  return false;
}

// ============================================================================
// Health Dog - Aggregates Witness Reports
// ============================================================================

/**
 * HealthDogOptions - Configuration for health dog
 */
export interface HealthDogOptions {
  /** Maximum age for witness reports (ms) - older reports are stale */
  reportMaxAgeMs?: number;
  /** Minimum number of witnesses required for healthy status */
  minWitnesses?: number;
  /** Health status threshold for overall health */
  minOverallStatus?: HealthStatus;
}

/**
 * HealthDogReport - Detailed health report from all witnesses
 */
export interface HealthDogReport {
  /** Overall system health status */
  overallStatus: HealthStatus;
  /** Summary message */
  summary: string;
  /** Individual witness reports */
  witnessReports: WitnessReportSummary[];
  /** Aggregate statistics */
  stats: HealthStats;
  /** Recommendations based on health status */
  recommendations: string[];
  /** Timestamp of the report */
  generatedAt: number;
}

/**
 * Summary of a single witness report
 */
export interface WitnessReportSummary {
  /** Witness ID */
  witnessId: string;
  /** Agent ID being monitored */
  agentId: string;
  /** Health status from this witness */
  healthStatus: HealthStatus;
  /** Whether the agent is responsive */
  isResponsive: boolean;
  /** Time since last activity in seconds */
  secondsSinceActivity: number;
  /** Number of failed checks */
  failedChecks: number;
  /** Details message */
  details?: string;
  /** Whether this report is stale */
  isStale: boolean;
}

/**
 * Aggregate health statistics
 */
export interface HealthStats {
  /** Total number of witnesses */
  totalWitnesses: number;
  /** Count by health status */
  byStatus: Record<HealthStatus, number>;
  /** Number of responsive agents */
  responsiveCount: number;
  /** Number of non-responsive agents */
  nonResponsiveCount: number;
  /** Average time since activity in seconds */
  avgSecondsSinceActivity: number;
}

/**
 * Run the Health Dog - generates detailed health report from witnesses
 * 
 * Aggregates multiple Witness reports into a comprehensive health analysis.
 * Provides statistics, recommendations, and identifies problem areas.
 * 
 * @param witnesses - Array of WitnessReport or Witness instances
 * @param options - Optional health dog configuration
 * @returns Structured result with detailed health report
 * 
 * @example
 * ```typescript
 * const result = runHealthDog(witnessReports, { minWitnesses: 3 });
 * if (result.data?.overallStatus === 'healthy') {
 *   console.log('System is healthy');
 * }
 * ```
 */
export function runHealthDog(
  witnesses: WitnessReport[],
  options: HealthDogOptions = {}
): DogResult<HealthDogReport> {
  const timestamp = Date.now();
  const reportMaxAgeMs = options.reportMaxAgeMs ?? 300_000; // 5 minutes default
  const minWitnesses = options.minWitnesses ?? 1;
  const minOverallStatus = options.minOverallStatus ?? 'degraded';
  
  try {
    // Validate input
    if (!witnesses || witnesses.length === 0) {
      return createComposableResult({
        success: false,
        timestamp,
        error: 'No witness reports provided',
        data: {
          overallStatus: 'dead',
          summary: 'No witnesses to report on',
          witnessReports: [],
          stats: createEmptyStats(),
          recommendations: ['Configure at least one witness to monitor agents'],
          generatedAt: timestamp,
        },
      });
    }
    
    // Process each witness report
    const now = Date.now();
    const witnessSummaries: WitnessReportSummary[] = witnesses.map(report => {
      const secondsSinceActivity = report.lastActivityAt 
        ? Math.round((now - report.lastActivityAt) / 1000)
        : Infinity;
      
      const isStale = report.lastActivityAt 
        ? (now - report.lastActivityAt) > reportMaxAgeMs
        : true;
      
      return {
        witnessId: report.id,
        agentId: report.agentId,
        healthStatus: report.healthStatus,
        isResponsive: report.isResponsive ?? false,
        secondsSinceActivity,
        failedChecks: report.failedChecks ?? 0,
        details: report.details,
        isStale,
      };
    });
    
    // Calculate aggregate statistics
    const stats = calculateHealthStats(witnessSummaries);
    
    // Determine overall status
    const overallStatus = determineOverallStatus(witnessSummaries, stats, minWitnesses);
    
    // Generate recommendations
    const recommendations = generateRecommendations(witnessSummaries, stats, overallStatus);
    
    // Build summary
    const summary = buildHealthSummary(witnessSummaries, stats, overallStatus);
    
    return createComposableResult({
      success: true,
      timestamp,
      data: {
        overallStatus,
        summary,
        witnessReports: witnessSummaries,
        stats,
        recommendations,
        generatedAt: timestamp,
      },
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createComposableResult({
      success: false,
      timestamp,
      error: `Health dog error: ${errorMessage}`,
      data: {
        overallStatus: 'dead',
        summary: `Health check failed: ${errorMessage}`,
        witnessReports: [],
        stats: createEmptyStats(),
        recommendations: ['Fix health check system error'],
        generatedAt: timestamp,
      },
    });
  }
}

/**
 * Create empty statistics object
 */
function createEmptyStats(): HealthStats {
  return {
    totalWitnesses: 0,
    byStatus: {
      healthy: 0,
      degraded: 0,
      stalled: 0,
      dead: 0,
    },
    responsiveCount: 0,
    nonResponsiveCount: 0,
    avgSecondsSinceActivity: 0,
  };
}

/**
 * Calculate aggregate health statistics
 */
function calculateHealthStats(summaries: WitnessReportSummary[]): HealthStats {
  const byStatus: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 0,
    stalled: 0,
    dead: 0,
  };
  
  let responsiveCount = 0;
  let nonResponsiveCount = 0;
  let totalSeconds = 0;
  let validActivityCount = 0;
  
  for (const summary of summaries) {
    byStatus[summary.healthStatus]++;
    
    if (summary.isResponsive) {
      responsiveCount++;
    } else {
      nonResponsiveCount++;
    }
    
    if (summary.secondsSinceActivity !== Infinity) {
      totalSeconds += summary.secondsSinceActivity;
      validActivityCount++;
    }
  }
  
  return {
    totalWitnesses: summaries.length,
    byStatus,
    responsiveCount,
    nonResponsiveCount,
    avgSecondsSinceActivity: validActivityCount > 0 
      ? Math.round(totalSeconds / validActivityCount) 
      : 0,
  };
}

/**
 * Determine overall health status from witness reports
 */
function determineOverallStatus(
  summaries: WitnessReportSummary[],
  stats: HealthStats,
  minWitnesses: number
): HealthStatus {
  // Not enough witnesses
  if (stats.totalWitnesses < minWitnesses) {
    return 'degraded';
  }
  
  // Any dead agents = system is affected
  if (stats.byStatus.dead > 0) {
    return 'dead';
  }
  
  // Multiple stalled agents
  if (stats.byStatus.stalled >= 2) {
    return 'stalled';
  }
  
  // Any stalled agent
  if (stats.byStatus.stalled === 1) {
    return 'degraded';
  }
  
  // Multiple degraded agents
  if (stats.byStatus.degraded >= 3) {
    return 'degraded';
  }
  
  // Any degraded agent
  if (stats.byStatus.degraded >= 1) {
    return 'degraded';
  }
  
  // All healthy
  return 'healthy';
}

/**
 * Generate recommendations based on health status
 */
function generateRecommendations(
  summaries: WitnessReportSummary[],
  stats: HealthStats,
  overallStatus: HealthStatus
): string[] {
  const recommendations: string[] = [];
  
  switch (overallStatus) {
    case 'dead':
      recommendations.push('CRITICAL: One or more agents are dead. Immediate intervention required.');
      recommendations.push('Consider restarting dead agents or investigating system failure.');
      break;
      
    case 'stalled':
      recommendations.push('WARNING: Some agents are stalled. Check for blocked tasks or hung processes.');
      recommendations.push('Consider sending wake-up signals or reassigning tasks.');
      break;
      
    case 'degraded':
      recommendations.push('NOTICE: System is operating with reduced capacity.');
      recommendations.push('Monitor degraded agents for recovery or escalate if status worsens.');
      break;
      
    case 'healthy':
      recommendations.push('System is operating normally.');
      break;
  }
  
  // Specific recommendations based on stats
  if (stats.byStatus.dead > 0) {
    const deadAgents = summaries
      .filter(s => s.healthStatus === 'dead')
      .map(s => s.agentId);
    recommendations.push(`Dead agents: ${deadAgents.join(', ')}`);
  }
  
  if (stats.byStatus.stalled > 0) {
    const stalledAgents = summaries
      .filter(s => s.healthStatus === 'stalled')
      .map(s => s.agentId);
    recommendations.push(`Stalled agents: ${stalledAgents.join(', ')}`);
  }
  
  if (stats.avgSecondsSinceActivity > 300) {
    recommendations.push(`High average inactivity: ${Math.round(stats.avgSecondsSinceActivity / 60)} minutes`);
  }
  
  return recommendations;
}

/**
 * Build human-readable health summary
 */
function buildHealthSummary(
  summaries: WitnessReportSummary[],
  stats: HealthStats,
  overallStatus: HealthStatus
): string {
  const total = stats.totalWitnesses;
  
  const statusCounts = Object.entries(stats.byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  
  return `Health ${overallStatus.toUpperCase()}: ${total} agent(s) monitored. Status breakdown: ${statusCounts || 'none'}.`;
}