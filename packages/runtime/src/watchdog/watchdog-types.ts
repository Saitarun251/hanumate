/**
 * Watchdog System - Type Definitions
 * 
 * Watchdog hierarchy for monitoring agent health and task execution:
 * - Witness: Health monitoring agent that checks on other agents
 * - Deacon: Patrol agent that verifies task completion
 * - Dog: Worker agent that executes assigned tasks
 */

import type { Bead } from '../beads/bead-types.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Health status values representing the state of an agent or system
 */
export type HealthStatus = 'healthy' | 'degraded' | 'stalled' | 'dead';

/**
 * Witness ID format: wit-xxxxx (5 alphanumeric characters)
 */
export type WitnessId = string;

/**
 * Deacon ID format: dea-xxxxx (5 alphanumeric characters)
 */
export type DeaconId = string;

/**
 * Dog ID format: dog-xxxxx (5 alphanumeric characters)
 */
export type DogId = string;

// ============================================================================
// Witness Types
// ============================================================================

/**
 * WitnessReport represents a health check report from a Witness agent
 */
export interface WitnessReport {
	/** Unique identifier for the witness */
	id: WitnessId;
	
	/** ID of the agent being monitored */
	agentId: string;
	
	/** Current health status of the agent */
	healthStatus: HealthStatus;
	
	/** Unix timestamp when the check was performed */
	timestamp: number;
	
	/** Whether the agent is responsive */
	isResponsive: boolean;
	
	/** Last activity timestamp (optional) */
	lastActivityAt?: number;
	
	/** Number of failed checks (optional) */
	failedChecks?: number;
	
	/** Details about the health status (optional) */
	details?: string;
	
	/** Additional metadata (optional) */
	metadata?: Record<string, unknown>;
}

/**
 * WitnessConfig defines the configuration for a Witness agent
 */
export interface WitnessConfig {
	/** Unique identifier for the witness */
	id: WitnessId;
	
	/** Human-readable name for the witness */
	name: string;
	
	/** Interval in milliseconds between health checks */
	checkIntervalMs: number;
	
	/** Maximum number of consecutive failures before marking as dead */
	maxFailures: number;
	
	/** Timeout in milliseconds for health check responses */
	timeoutMs: number;
	
	/** List of agent IDs to monitor */
	monitoredAgents: string[];
	
	/** Whether the witness is active */
	isActive: boolean;
	
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Deacon Types
// ============================================================================

/**
 * DeaconReport represents a patrol report from a Deacon agent
 * Deacons verify task completion and report findings
 */
export interface DeaconReport {
	/** Unique identifier for the deacon */
	id: DeaconId;
	
	/** ID of the bead/task being verified */
	beadId: string;
	
	/** ID of the agent that completed the task */
	completedByAgentId?: string;
	
	/** Whether the task was completed successfully */
	isCompleted: boolean;
	
	/** Whether the task meets quality standards */
	meetsStandards: boolean;
	
	/** Unix timestamp when the patrol was performed */
	timestamp: number;
	
	/** Summary of findings (optional) */
	summary?: string;
	
	/** List of issues found (optional) */
	issues?: string[];
	
	/** Confidence level 0-1 (optional) */
	confidence?: number;
	
	/** Additional metadata (optional) */
	metadata?: Record<string, unknown>;
}

/**
 * DeaconConfig defines the configuration for a Deacon agent
 */
export interface DeaconConfig {
	/** Unique identifier for the deacon */
	id: DeaconId;
	
	/** Human-readable name for the deacon */
	name: string;
	
	/** Interval in milliseconds between patrol cycles */
	patrolIntervalMs: number;
	
	/** Maximum tasks to verify per cycle */
	maxTasksPerCycle: number;
	
	/** Quality thresholds for verification */
	qualityThreshold: number;
	
	/** Whether the deacon is active */
	isActive: boolean;
	
	/** List of bead IDs to verify (optional) */
	targetBeads?: string[];
	
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Dog Types
// ============================================================================

/**
 * DogTask represents a task assigned to a Dog worker agent
 */
export interface DogTask {
	/** Unique identifier for the task */
	id: DogId;
	
	/** ID of the bead this task relates to */
	beadId: string;
	
	/** ID of the agent assigned to this task */
	assignedAgentId?: string;
	
	/** Current status of the task */
	status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
	
	/** Unix timestamp when the task was created */
	createdAt: number;
	
	/** Unix timestamp when the task was assigned (optional) */
	assignedAt?: number;
	
	/** Unix timestamp when work started (optional) */
	startedAt?: number;
	
	/** Unix timestamp when completed (optional) */
	completedAt?: number;
	
	/** Priority level */
	priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
	
	/** Estimated duration in milliseconds (optional) */
	estimatedDurationMs?: number;
	
	/** Actual duration in milliseconds (optional) */
	actualDurationMs?: number;
	
	/** Task description (optional) */
	description?: string;
	
	/** Result of task execution (optional) */
	result?: string;
	
	/** Error message if failed (optional) */
	error?: string;
	
	/** Additional metadata (optional) */
	metadata?: Record<string, unknown>;
}

/**
 * DogConfig defines the configuration for a Dog worker agent
 */
export interface DogConfig {
	/** Unique identifier for the dog */
	id: DogId;
	
	/** Human-readable name for the dog */
	name: string;
	
	/** Agent ID this dog is associated with */
	agentId: string;
	
	/** Maximum concurrent tasks */
	maxConcurrentTasks: number;
	
	/** Task timeout in milliseconds */
	taskTimeoutMs: number;
	
	/** Whether the dog is active */
	isActive: boolean;
	
	/** List of skill IDs the dog can execute (optional) */
	skills?: string[];
	
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Patrol Types
// ============================================================================

/**
 * PatrolCycle represents a complete patrol round by a Deacon
 */
export interface PatrolCycle {
	/** Unique identifier for the patrol cycle */
	id: string;
	
	/** ID of the deacon that performed the patrol */
	deaconId: DeaconId;
	
	/** Unix timestamp when the patrol started */
	startTime: number;
	
	/** Unix timestamp when the patrol ended */
	endTime?: number;
	
	/** Total duration in milliseconds (optional) */
	durationMs?: number;
	
	/** Number of tasks verified */
	tasksVerified: number;
	
	/** Number of tasks passed */
	tasksPassed: number;
	
	/** Number of tasks failed */
	tasksFailed: number;
	
	/** Whether the patrol completed successfully */
	completed: boolean;
	
	/** List of deacon reports from this cycle */
	reports: DeaconReport[];
	
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique Witness ID
 * Format: wit-xxxxx (5 alphanumeric characters)
 */
export function generateWitnessId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'wit-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Generate a unique Deacon ID
 * Format: dea-xxxxx (5 alphanumeric characters)
 */
export function generateDeaconId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'dea-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Generate a unique Dog ID
 * Format: dog-xxxxx (5 alphanumeric characters)
 */
export function generateDogId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'dog-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Validate a Witness ID format
 * @param id - ID to validate
 * @returns true if valid format
 */
export function isValidWitnessId(id: string): boolean {
	return /^wit-[a-z0-9]{5}$/.test(id);
}

/**
 * Validate a Deacon ID format
 * @param id - ID to validate
 * @returns true if valid format
 */
export function isValidDeaconId(id: string): boolean {
	return /^dea-[a-z0-9]{5}$/.test(id);
}

/**
 * Validate a Dog ID format
 * @param id - ID to validate
 * @returns true if valid format
 */
export function isValidDogId(id: string): boolean {
	return /^dog-[a-z0-9]{5}$/.test(id);
}

/**
 * Get the health status based on response time and failure count
 * @param avgResponseTimeMs - Average response time in milliseconds
 * @param failureCount - Number of consecutive failures
 * @param thresholdMs - Response time threshold for healthy status
 * @returns Health status
 */
export function calculateHealthStatus(
	avgResponseTimeMs: number,
	failureCount: number,
	thresholdMs: number = 5000
): HealthStatus {
	if (failureCount >= 5) {
		return 'dead';
	}
	if (failureCount >= 3) {
		return 'stalled';
	}
	if (avgResponseTimeMs > thresholdMs * 2) {
		return 'degraded';
	}
	if (avgResponseTimeMs > thresholdMs) {
		return 'degraded';
	}
	return 'healthy';
}

/**
 * Create a default WitnessConfig
 * @param partial - Partial configuration to override defaults
 * @returns Complete WitnessConfig
 */
export function createWitnessConfig(partial: Partial<WitnessConfig> = {}): WitnessConfig {
	return {
		id: generateWitnessId(),
		name: partial.name ?? 'Witness',
		checkIntervalMs: partial.checkIntervalMs ?? 30000,
		maxFailures: partial.maxFailures ?? 5,
		timeoutMs: partial.timeoutMs ?? 5000,
		monitoredAgents: partial.monitoredAgents ?? [],
		isActive: partial.isActive ?? true,
		metadata: partial.metadata,
	};
}

/**
 * Create a default DeaconConfig
 * @param partial - Partial configuration to override defaults
 * @returns Complete DeaconConfig
 */
export function createDeaconConfig(partial: Partial<DeaconConfig> = {}): DeaconConfig {
	return {
		id: generateDeaconId(),
		name: partial.name ?? 'Deacon',
		patrolIntervalMs: partial.patrolIntervalMs ?? 60000,
		maxTasksPerCycle: partial.maxTasksPerCycle ?? 10,
		qualityThreshold: partial.qualityThreshold ?? 0.8,
		isActive: partial.isActive ?? true,
		targetBeads: partial.targetBeads,
		metadata: partial.metadata,
	};
}

/**
 * Create a default DogConfig
 * @param partial - Partial configuration to override defaults
 * @returns Complete DogConfig
 */
export function createDogConfig(partial: Partial<DogConfig> = {}): DogConfig {
	return {
		id: generateDogId(),
		name: partial.name ?? 'Dog',
		agentId: partial.agentId ?? '',
		maxConcurrentTasks: partial.maxConcurrentTasks ?? 1,
		taskTimeoutMs: partial.taskTimeoutMs ?? 300000,
		isActive: partial.isActive ?? true,
		skills: partial.skills,
		metadata: partial.metadata,
	};
}

/**
 * Create a new DogTask from a Bead
 * @param bead - Bead to create task from
 * @param partial - Partial overrides
 * @returns New DogTask
 */
export function createDogTask(bead: Bead, partial: Partial<DogTask> = {}): DogTask {
	const now = Date.now();
	return {
		id: generateDogId(),
		beadId: bead.id,
		assignedAgentId: bead.assignee,
		status: 'pending',
		createdAt: now,
		assignedAt: bead.assignee ? now : undefined,
		priority: bead.priority,
		description: bead.description,
		metadata: partial.metadata,
	};
}