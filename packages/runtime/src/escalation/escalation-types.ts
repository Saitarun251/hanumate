/**
 * Escalation Types - Severity-Routed Issue Escalation
 * 
 * Routes critical issues to appropriate handlers.
 */

/**
 * Severity levels for escalations
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

/**
 * Escalation status
 */
export type EscalationStatus = 'open' | 'acknowledged' | 'resolved';

/**
 * Route for escalation (who handles it)
 */
export type EscalationRoute = 'deacon' | 'mayor' | 'overseer';

/**
 * Escalation ID format: esc-xxxxx
 */
export type EscalationId = string;

/**
 * Escalation record
 */
export interface Escalation {
	/** Unique identifier */
	id: EscalationId;
	
	/** Severity level */
	severity: Severity;
	
	/** Description of the issue */
	description: string;
	
	/** Who reported this */
	reporter: string;
	
	/** When it was created */
	createdAt: number;
	
	/** When it was updated */
	updatedAt: number;
	
	/** Current status */
	status: EscalationStatus;
	
	/** Who should handle this */
	route: EscalationRoute;
	
	/** Agent ID that acknowledged */
	acknowledgedBy?: string;
	
	/** When it was acknowledged */
	acknowledgedAt?: number;
	
	/** Who resolved it */
	resolvedBy?: string;
	
	/** When it was resolved */
	resolvedAt?: number;
	
	/** Resolution notes */
	resolution?: string;
	
	/** Related bead IDs */
	relatedBeads?: string[];
	
	/** Metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Escalation options
 */
export interface EscalationOptions {
	/** Storage directory */
	storageDir?: string;
	
	/** Auto-acknowledge CRITICAL after ms */
	autoAcknowledgeMs?: number;
	
	/** Notification callbacks */
	onEscalate?: (esc: Escalation) => void;
	onAcknowledge?: (esc: Escalation) => void;
	onResolve?: (esc: Escalation) => void;
}

/**
 * Severity priority (lower = more severe)
 */
export const SEVERITY_PRIORITY: Record<Severity, number> = {
	'CRITICAL': 0,
	'HIGH': 1,
	'MEDIUM': 2,
};

/**
 * Default route for each severity
 */
export const DEFAULT_ROUTES: Record<Severity, EscalationRoute> = {
	'CRITICAL': 'overseer',
	'HIGH': 'mayor',
	'MEDIUM': 'deacon',
};

/**
 * Generate an escalation ID
 */
export function generateEscalationId(): EscalationId {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = 'esc-';
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Create a new escalation
 */
export function createEscalation(
	severity: Severity,
	description: string,
	reporter: string,
	options?: {
		relatedBeads?: string[];
		metadata?: Record<string, unknown>;
	}
): Escalation {
	const now = Date.now();
	return {
		id: generateEscalationId(),
		severity,
		description,
		reporter,
		createdAt: now,
		updatedAt: now,
		status: 'open',
		route: DEFAULT_ROUTES[severity],
		relatedBeads: options?.relatedBeads,
		metadata: options?.metadata,
	};
}

/**
 * Check if severity A is more severe than severity B
 */
export function isMoreSevere(a: Severity, b: Severity): boolean {
	return SEVERITY_PRIORITY[a] < SEVERITY_PRIORITY[b];
}

/**
 * Get the highest severity from a list
 */
export function getHighestSeverity(severities: Severity[]): Severity | null {
	if (severities.length === 0) return null;
	return severities.reduce((highest, current) =>
		isMoreSevere(current, highest) ? current : highest
	);
}