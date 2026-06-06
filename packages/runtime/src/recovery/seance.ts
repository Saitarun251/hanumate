/**
 * Seance - Session Discovery and Recovery
 * 
 * Enables agents to discover and recover context from previous sessions.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
	SessionRecord,
	SessionId,
	SessionEvent,
	SessionEventType,
	SessionQuery,
	SeanceOptions,
	PredecessorQuestion,
	PredecessorAnswer,
} from './seance-types.js';
import {
	generateSessionId,
	createSessionRecord,
	createSessionEvent,
	getSessionDuration,
} from './seance-types.js';

/**
 * Seance service for session discovery and recovery
 */
export class Seance {
	private readonly storageDir: string;
	private readonly maxEventsPerSession: number;
	private readonly retentionDays: number;
	private readonly checkpointInterval: number;

	private sessions: Map<SessionId, SessionRecord> = new Map();
	private byAgent: Map<string, SessionId[]> = new Map();
	private byBead: Map<string, SessionId[]> = new Map();

	/**
	 * Create a new Seance instance
	 */
	constructor(options: SeanceOptions = {}) {
		this.storageDir = options.storageDir ?? '.rubberduck/sessions';
		this.maxEventsPerSession = options.maxEventsPerSession ?? 10000;
		this.retentionDays = options.retentionDays ?? 30;
		this.checkpointInterval = options.checkpointIntervalMs ?? 60000;
	}

	/**
	 * Initialize the service
	 */
	async init(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true });
		await this.load();
		await this.cleanup();
	}

	/**
	 * Clear all data (for testing)
	 */
	async clear(): Promise<void> {
		this.sessions = new Map();
		this.byAgent = new Map();
		this.byBead = new Map();
		try {
			await fs.unlink(path.join(this.storageDir, 'index.json'));
		} catch {
			// File might not exist
		}
	}

	/**
	 * Load sessions from storage
	 */
	private async load(): Promise<void> {
		try {
			const indexPath = path.join(this.storageDir, 'index.json');
			const data = await fs.readFile(indexPath, 'utf-8');
			const ids: string[] = JSON.parse(data);

			for (const id of ids) {
				const sessionPath = path.join(this.storageDir, `${id}.json`);
				try {
					const sessionData = await fs.readFile(sessionPath, 'utf-8');
					const session = JSON.parse(sessionData) as SessionRecord;
					this.addToMaps(session);
				} catch {
					// Skip invalid sessions
				}
			}
		} catch {
			// No saved sessions
		}
	}

	/**
	 * Save the session index
	 */
	private async saveIndex(): Promise<void> {
		const indexPath = path.join(this.storageDir, 'index.json');
		const ids = Array.from(this.sessions.keys());
		await fs.writeFile(indexPath, JSON.stringify(ids, null, 2));
	}

	/**
	 * Save a session to its own file
	 */
	private async saveSession(session: SessionRecord): Promise<void> {
		const sessionPath = path.join(this.storageDir, `${session.id}.json`);
		await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
	}

	/**
	 * Add a session to internal maps
	 */
	private addToMaps(session: SessionRecord): void {
		this.sessions.set(session.id, session);

		// By agent
		const agentSessions = this.byAgent.get(session.agentId) ?? [];
		if (!agentSessions.includes(session.id)) {
			agentSessions.push(session.id);
			this.byAgent.set(session.agentId, agentSessions);
		}

		// By bead
		for (const beadId of session.workBeads) {
			const beadSessions = this.byBead.get(beadId) ?? [];
			if (!beadSessions.includes(session.id)) {
				beadSessions.push(session.id);
				this.byBead.set(beadId, beadSessions);
			}
		}
	}

	/**
	 * Create a new session
	 */
	async createSession(
		agentId: string,
		options?: {
			workBeads?: string[];
			metadata?: Record<string, unknown>;
		}
	): Promise<SessionRecord> {
		const session = createSessionRecord(agentId, options);

		this.addToMaps(session);
		await this.saveIndex();
		await this.saveSession(session);

		return session;
	}

	/**
	 * Log an event to a session
	 */
	async logEvent(sessionId: string, event: SessionEvent): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}

		// Set sequence if not set
		if (event.sequence === undefined) {
			event.sequence = session.events.length;
		}

		event.timestamp = Date.now();
		session.events.push(event);
		session.lastEventAt = event.timestamp;

		// Trim if too many events
		if (session.events.length > this.maxEventsPerSession) {
			session.events = session.events.slice(-this.maxEventsPerSession);
		}

		await this.saveSession(session);
	}

	/**
	 * Log a checkpoint event
	 */
	async checkpoint(sessionId: string, data: unknown): Promise<void> {
		const event = createSessionEvent('checkpoint', data);
		await this.logEvent(sessionId, event);
	}

	/**
	 * Discover previous sessions for an agent
	 */
	async discover(agentId: string, options?: {
		limit?: number;
		status?: SessionRecord['status'];
	}): Promise<SessionRecord[]> {
		const sessionIds = this.byAgent.get(agentId) ?? [];
		let sessions = sessionIds
			.map(id => this.sessions.get(id))
			.filter((s): s is SessionRecord => s !== undefined)
			.sort((a, b) => b.startedAt - a.startedAt); // Most recent first

		// Filter by status
		if (options?.status) {
			sessions = sessions.filter(s => s.status === options.status);
		}

		// Limit results
		if (options?.limit) {
			sessions = sessions.slice(0, options.limit);
		}

		return sessions;
	}

	/**
	 * Talk to a predecessor session (conversational replay)
	 */
	async talk(sessionId: string, question: string): Promise<string> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}

		// Build context from events
		const context = this.buildContext(session);
		
		// Generate response based on session events
		const answer = this.generateAnswer(session, question, context);

		return answer;
	}

	/**
	 * One-shot question to predecessor
	 */
	async ask(sessionId: string, question: string): Promise<string> {
		return this.talk(sessionId, question);
	}

	/**
	 * Get events from a session
	 */
	async getEvents(sessionId: string): Promise<SessionEvent[]> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}
		return session.events;
	}

	/**
	 * End a session
	 */
	async endSession(sessionId: string, status: SessionRecord['status']): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}

		session.status = status;
		session.endedAt = Date.now();

		// Log end event
		await this.logEvent(sessionId, createSessionEvent('complete', { status }));

		await this.saveSession(session);
	}

	/**
	 * Get a session by ID
	 */
	async getSession(sessionId: string): Promise<SessionRecord | null> {
		return this.sessions.get(sessionId) ?? null;
	}

	/**
	 * Get all sessions matching a query
	 */
	async query(options: SessionQuery = {}): Promise<SessionRecord[]> {
		let sessions = Array.from(this.sessions.values());

		// Filter by agent
		if (options.agentId) {
			sessions = sessions.filter(s => s.agentId === options.agentId);
		}

		// Filter by status
		if (options.status) {
			sessions = sessions.filter(s => s.status === options.status);
		}

		// Filter by bead
		if (options.beadId) {
			sessions = sessions.filter(s => s.workBeads.includes(options.beadId!));
		}

		// Filter by time range
		if (options.startTime) {
			sessions = sessions.filter(s => s.startedAt >= options.startTime!);
		}
		if (options.endTime) {
			sessions = sessions.filter(s => s.startedAt <= options.endTime!);
		}

		// Sort
		sessions.sort((a, b) =>
			options.sort === 'asc' ? a.startedAt - b.startedAt : b.startedAt - a.startedAt
		);

		// Limit
		if (options.limit) {
			sessions = sessions.slice(0, options.limit);
		}

		return sessions;
	}

	/**
	 * Clean up old sessions
	 */
	private async cleanup(): Promise<void> {
		const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
		const toDelete: SessionId[] = [];

		for (const [id, session] of this.sessions) {
			if (session.endedAt && session.endedAt < cutoff) {
				toDelete.push(id);
			}
		}

		for (const id of toDelete) {
			const session = this.sessions.get(id);
			if (session) {
				// Remove from maps
				const agentSessions = this.byAgent.get(session.agentId);
				if (agentSessions) {
					this.byAgent.set(session.agentId, agentSessions.filter(sid => sid !== id));
				}

				for (const beadId of session.workBeads) {
					const beadSessions = this.byBead.get(beadId);
					if (beadSessions) {
						this.byBead.set(beadId, beadSessions.filter(sid => sid !== id));
					}
				}

				this.sessions.delete(id);

				// Delete file
				try {
					const sessionPath = path.join(this.storageDir, `${id}.json`);
					await fs.unlink(sessionPath);
				} catch {
					// File might not exist
				}
			}
		}

		if (toDelete.length > 0) {
			await this.saveIndex();
		}
	}

	/**
	 * Build context from session events
	 */
	private buildContext(session: SessionRecord): string {
		const parts: string[] = [];
		parts.push(`Session ${session.id} for agent ${session.agentId}`);
		parts.push(`Duration: ${getSessionDuration(session)}ms`);
		parts.push(`Work beads: ${session.workBeads.join(', ') || 'none'}`);
		parts.push(`Status: ${session.status}`);
		parts.push(`Events (${session.events.length}):`);

		// Summarize events
		const eventCounts: Record<string, number> = {};
		for (const event of session.events) {
			eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
		}
		parts.push(JSON.stringify(eventCounts));

		return parts.join('\n');
	}

	/**
	 * Generate answer based on session context
	 */
	private generateAnswer(session: SessionRecord, question: string, context: string): string {
		// This is a simplified implementation
		// In a real implementation, this would use an LLM to generate answers

		const q = question.toLowerCase();

		if (q.includes('what') && q.includes('work')) {
			if (session.workBeads.length === 0) {
				return 'This session did not work on any beads.';
			}
			return `This session worked on: ${session.workBeads.join(', ')}`;
		}

		if (q.includes('how long') || q.includes('duration')) {
			const duration = getSessionDuration(session);
			const seconds = Math.round(duration / 1000);
			const minutes = Math.round(seconds / 60);
			return `This session ran for approximately ${minutes} minutes (${seconds} seconds).`;
		}

		if (q.includes('event')) {
			return `This session had ${session.events.length} events: ${Object.entries(
				session.events.reduce((acc, e) => {
					acc[e.type] = (acc[e.type] ?? 0) + 1;
					return acc;
				}, {} as Record<string, number>)
			).map(([type, count]) => `${count} ${type}`).join(', ')}`;
		}

		if (q.includes('status')) {
			return `This session's final status was: ${session.status}`;
		}

		return `Based on session ${session.id}:\n${context}`;
	}

	/**
	 * Get session statistics
	 */
	async getStats(): Promise<{
		total: number;
		active: number;
		completed: number;
		failed: number;
		abandoned: number;
	}> {
		const sessions = Array.from(this.sessions.values());
		return {
			total: sessions.length,
			active: sessions.filter(s => s.status === 'active').length,
			completed: sessions.filter(s => s.status === 'completed').length,
			failed: sessions.filter(s => s.status === 'failed').length,
			abandoned: sessions.filter(s => s.status === 'abandoned').length,
		};
	}
}