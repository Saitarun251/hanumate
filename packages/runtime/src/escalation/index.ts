/**
 * Escalation Index - Exports
 */

export { EscalationService } from './escalation.js';
export type {
	Escalation,
	EscalationId,
	Severity,
	EscalationStatus,
	EscalationRoute,
	EscalationOptions,
} from './escalation-types.js';
export {
	generateEscalationId,
	createEscalation,
	SEVERITY_PRIORITY,
	DEFAULT_ROUTES,
	isMoreSevere,
	getHighestSeverity,
} from './escalation-types.js';