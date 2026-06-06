/**
 * Refinery Types - Merge Queue System
 * 
 * Bors-style merge queue for quality gates and batch verification.
 */

/**
 * Merge Request ID format: mr-xxxxx
 */
export type MergeRequestId = string;

/**
 * Merge request status
 */
export type MergeStatus = 'pending' | 'testing' | 'passed' | 'failed' | 'merged' | 'cancelled';

/**
 * Test result for a merge request
 */
export interface TestResult {
	name: string;
	passed: boolean;
	duration: number;
	error?: string;
}

/**
 * Gate result from verification
 */
export interface GateResult {
	passed: boolean;
	name: string;
	details: string;
	duration: number;
	error?: string;
}

/**
 * Merge request in the queue
 */
export interface MergeRequest {
	/** Unique identifier */
	id: MergeRequestId;
	
	/** Branch name to merge */
	branch: string;
	
	/** Author of the MR */
	author: string;
	
	/** Optional bead ID this relates to */
	beadId?: string;
	
	/** Optional convoy ID this relates to */
	convoyId?: string;
	
	/** Current status */
	status: MergeStatus;
	
	/** When the MR was created */
	createdAt: number;
	
	/** When the MR was updated */
	updatedAt: number;
	
	/** Test results from CI/gates */
	testResults?: TestResult[];
	
	/** Verification gate results */
	gateResults?: GateResult[];
	
	/** Metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Verification gate interface
 */
export interface VerificationGate {
	/** Gate name */
	name: string;
	
	/** Run the verification */
	run(mr: MergeRequest): Promise<GateResult>;
	
	/** Optional priority (lower = runs first) */
	priority?: number;
}

/**
 * Bisect result for failure analysis
 */
export interface BisectResult {
	/** Commits analyzed */
	commits: string[];
	
	/** Breaking commit identified */
	breakingCommit?: string;
	
	/** Reason for failure */
	reason?: string;
	
	/** Bisect completed */
	completed: boolean;
}

/**
 * Queue options
 */
export interface QueueOptions {
	/** Maximum batch size */
	batchSize?: number;
	
	/** Storage directory */
	storageDir?: string;
}

/**
 * Refinery configuration
 */
export interface RefineryConfig {
	/** Maximum concurrent verifications */
	maxConcurrency?: number;
	
	/** Batch size for processing */
	batchSize?: number;
	
	/** Verification gates to run */
	gates?: VerificationGate[];
	
	/** Storage directory */
	storageDir?: string;
	
	/** Git executable path */
	gitPath?: string;
}

/**
 * Refinery status
 */
export interface RefineryStatus {
	/** Total MRs in queue */
	queueSize: number;
	
	/** MRs currently being tested */
	testing: number;
	
	/** MRs that passed */
	passed: number;
	
	/** MRs that failed */
	failed: number;
	
	/** MRs merged */
	merged: number;
}

/**
 * Generate a merge request ID
 */
export function generateMergeRequestId(): MergeRequestId {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'mr-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Create a new merge request
 */
export function createMergeRequest(
	branch: string,
	author: string,
	options?: {
		beadId?: string;
		convoyId?: string;
		metadata?: Record<string, unknown>;
	}
): MergeRequest {
	const now = Date.now();
	return {
		id: generateMergeRequestId(),
		branch,
		author,
		beadId: options?.beadId,
		convoyId: options?.convoyId,
		status: 'pending',
		createdAt: now,
		updatedAt: now,
		metadata: options?.metadata,
	};
}