/**
 * Escalation Service - Severity-Routed Issue Escalation
 * 
 * Routes critical issues to appropriate handlers (Deacon, Mayor, Overseer).
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
	Escalation,
	EscalationId,
	Severity,
	EscalationStatus,
	EscalationRoute,
	EscalationOptions,
} from './escalation-types.js';
import {
	generateEscalationId,
	createEscalation,
	DEFAULT_ROUTES,
} from './escalation-types.js';

/**
 * Escalation service for managing critical issues
 */
export class EscalationService {
	private readonly storageDir: string;
	private readonly autoAcknowledgeMs: number;
	private readonly onEscalate?: (esc: Escalation) => void;
	private readonly onAcknowledge?: (esc: Escalation) => void;
	private readonly onResolve?: (esc: Escalation) => void;
	
	private escalations: Map<EscalationId, Escalation> = new Map();
	private byRoute: Map<EscalationRoute, EscalationId[]> = new Map();
	private byStatus: Map<EscalationStatus, EscalationId[]> = new Map();

	/**
	 * Create a new escalation service
	 */
	constructor(options: EscalationOptions = {}) {
		this.storageDir = options.storageDir ?? '.rubberduck/escalations';
		this.autoAcknowledgeMs = options.autoAcknowledgeMs ?? 60000;
		this.onEscalate = options.onEscalate;
		this.onAcknowledge = options.onAcknowledge;
		this.onResolve = options.onResolve;
	}

	/**
	 * Initialize the service (load from storage)
	 */
	async init(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true });
		await this.load();
	}

	/**
	 * Clear all data (for testing)
	 */
	async clear(): Promise<void> {
		this.escalations = new Map();
		this.byRoute = new Map();
		this.byStatus = new Map();
		try {
			await fs.unlink(path.join(this.storageDir, 'index.json'));
		} catch {
			// File might not exist
		}
	}

	/**
	 * Load escalations from storage
	 */
	private async load(): Promise<void> {
		try {
			const indexPath = path.join(this.storageDir, 'index.json');
			const data = await fs.readFile(indexPath, 'utf-8');
			const ids: string[] = JSON.parse(data);
			
			for (const id of ids) {
				const escPath = path.join(this.storageDir, `${id}.json`);
				const escData = await fs.readFile(escPath, 'utf-8');
				const esc = JSON.parse(escData) as Escalation;
				this.addToMaps(esc);
			}
		} catch {
			// No saved escalations, start fresh
		}
	}

	/**
	 * Save all escalation IDs
	 */
	private async saveIndex(): Promise<void> {
		const indexPath = path.join(this.storageDir, 'index.json');
		const ids = Array.from(this.escalations.keys());
		await fs.writeFile(indexPath, JSON.stringify(ids, null, 2));
	}

	/**
	 * Save an escalation to its own file
	 */
	private async saveEscalation(esc: Escalation): Promise<void> {
		const escPath = path.join(this.storageDir, `${esc.id}.json`);
		await fs.writeFile(escPath, JSON.stringify(esc, null, 2));
	}

	/**
	 * Add an escalation to internal maps
	 */
	private addToMaps(esc: Escalation): void {
		this.escalations.set(esc.id, esc);
		
		// By route
		const routeList = this.byRoute.get(esc.route) ?? [];
		if (!routeList.includes(esc.id)) {
			routeList.push(esc.id);
			this.byRoute.set(esc.route, routeList);
		}
		
		// By status
		const statusList = this.byStatus.get(esc.status) ?? [];
		if (!statusList.includes(esc.id)) {
			statusList.push(esc.id);
			this.byStatus.set(esc.status, statusList);
		}
	}

	/**
	 * Remove an escalation from internal maps
	 */
	private removeFromMaps(esc: Escalation): void {
		this.removeFromMapsByStatus(esc, esc.status);
	}

	/**
	 * Remove an escalation from maps by specific status
	 */
	private removeFromMapsByStatus(esc: Escalation, status: EscalationStatus): void {
		// By route
		const routeList = this.byRoute.get(esc.route);
		if (routeList) {
			this.byRoute.set(esc.route, routeList.filter(id => id !== esc.id));
		}
		
		// By status
		const statusList = this.byStatus.get(status);
		if (statusList) {
			this.byStatus.set(status, statusList.filter(id => id !== esc.id));
		}
	}

	/**
	 * Create a new escalation
	 */
	async escalate(
		severity: Severity,
		description: string,
		reporter: string,
		options?: {
			relatedBeads?: string[];
			metadata?: Record<string, unknown>;
		}
	): Promise<Escalation> {
		const esc = createEscalation(severity, description, reporter, options);
		
		this.addToMaps(esc);
		await this.saveIndex();
		await this.saveEscalation(esc);
		
		// Notify
		this.onEscalate?.(esc);
		
		return esc;
	}

	/**
	 * Acknowledge an escalation
	 */
	async acknowledge(escId: string, acknowledgedBy: string): Promise<void> {
		const esc = this.escalations.get(escId);
		if (!esc) {
			throw new Error(`Escalation ${escId} not found`);
		}

		if (esc.status !== 'open') {
			throw new Error(`Escalation ${escId} is not open`);
		}

		const now = Date.now();
		const oldStatus = esc.status; // Save old status for map update
		esc.status = 'acknowledged';
		esc.acknowledgedBy = acknowledgedBy;
		esc.acknowledgedAt = now;
		esc.updatedAt = now;

		// Update maps - remove from old status, add to new status
		this.removeFromMapsByStatus(esc, oldStatus);
		this.addToMaps(esc);

		await this.saveEscalation(esc);
		this.onAcknowledge?.(esc);
	}

	/**
	 * Resolve an escalation
	 */
	async resolve(
		escId: string,
		resolvedBy: string,
		resolution?: string
	): Promise<void> {
		const esc = this.escalations.get(escId);
		if (!esc) {
			throw new Error(`Escalation ${escId} not found`);
		}

		if (esc.status === 'resolved') {
			throw new Error(`Escalation ${escId} is already resolved`);
		}

		const now = Date.now();
		const oldStatus = esc.status; // Save old status for map update
		esc.status = 'resolved';
		esc.resolvedBy = resolvedBy;
		esc.resolvedAt = now;
		esc.resolution = resolution;
		esc.updatedAt = now;

		// Update maps - remove from old status, add to new status
		this.removeFromMapsByStatus(esc, oldStatus);
		this.addToMaps(esc);

		await this.saveEscalation(esc);
		this.onResolve?.(esc);
	}

	/**
	 * List all open escalations
	 */
	async listOpen(): Promise<Escalation[]> {
		const openIds = this.byStatus.get('open') ?? [];
		return openIds
			.map(id => this.escalations.get(id))
			.filter((esc): esc is Escalation => esc !== undefined)
			.sort((a, b) => {
				// Sort by severity (CRITICAL first), then by creation time
				const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2 };
				const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
				if (severityDiff !== 0) return severityDiff;
				return a.createdAt - b.createdAt;
			});
	}

	/**
	 * List escalations by severity
	 */
	async listBySeverity(severity: Severity): Promise<Escalation[]> {
		return Array.from(this.escalations.values())
			.filter(esc => esc.severity === severity && esc.status !== 'resolved')
			.sort((a, b) => a.createdAt - b.createdAt);
	}

	/**
	 * List escalations by route
	 */
	async listByRoute(route: EscalationRoute): Promise<Escalation[]> {
		const routeIds = this.byRoute.get(route) ?? [];
		return routeIds
			.map(id => this.escalations.get(id))
			.filter((esc): esc is Escalation => esc !== undefined)
			.filter(esc => esc.status !== 'resolved')
			.sort((a, b) => a.createdAt - b.createdAt);
	}

	/**
	 * Get the count of critical escalations
	 */
	getCriticalCount(): number {
		const criticalIds = this.byStatus.get('open') ?? [];
		return criticalIds.filter(id => {
			const esc = this.escalations.get(id);
			return esc?.severity === 'CRITICAL';
		}).length;
	}

	/**
	 * Get the count of high severity escalations
	 */
	getHighCount(): number {
		const highIds = this.byStatus.get('open') ?? [];
		return highIds.filter(id => {
			const esc = this.escalations.get(id);
			return esc?.severity === 'HIGH';
		}).length;
	}

	/**
	 * Get an escalation by ID
	 */
	async get(escId: string): Promise<Escalation | null> {
		return this.escalations.get(escId) ?? null;
	}

	/**
	 * Get all escalations
	 */
	async getAll(): Promise<Escalation[]> {
		return Array.from(this.escalations.values())
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	/**
	 * Delete an escalation
	 */
	async delete(escId: string): Promise<void> {
		const esc = this.escalations.get(escId);
		if (!esc) return;

		this.escalations.delete(escId);
		this.removeFromMaps(esc);

		try {
			const escPath = path.join(this.storageDir, `${escId}.json`);
			await fs.unlink(escPath);
		} catch {
			// File might not exist
		}

		await this.saveIndex();
	}
}