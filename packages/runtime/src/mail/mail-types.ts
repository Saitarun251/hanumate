/**
 * Mail Types - Persistent agent messaging
 */

/**
 * A mail message between agents
 */
export interface Mail {
  /** Unique message ID (format: msg-xxxxx) */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID */
  to: string;
  /** Message subject */
  subject: string;
  /** Message body */
  body: string;
  /** Whether message has been read */
  read: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** When message was read */
  readAt?: number;
}

/**
 * Mail configuration
 */
export interface MailConfig {
  /** Directory to store mail files */
  mailDir?: string;
  /** Agent ID for this agent (for inbox filtering) */
  agentId?: string;
}

/**
 * Mail filter options
 */
export interface MailFilter {
  /** Filter by recipient */
  to?: string;
  /** Filter by sender */
  from?: string;
  /** Include read messages */
  includeRead?: boolean;
  /** Filter by subject keyword */
  subject?: string;
}