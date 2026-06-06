/**
 * Recovery Index - Session Recovery Exports
 */

export { Seance } from './seance.js';
export type {
	SessionRecord,
	SessionId,
	SessionEvent,
	SessionEventType,
	SessionQuery,
	SeanceOptions,
	PredecessorQuestion,
	PredecessorAnswer,
} from './seance-types.js';
export {
	generateSessionId,
	createSessionRecord,
	createSessionEvent,
	getSessionDuration,
	isSessionStale,
} from './seance-types.js';