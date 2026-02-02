/**
 * Agent Response Types
 *
 * These types define the strict JSON structure that the AI agent must produce.
 * The LLM output is validated against these types before processing.
 */

import type { TicketCategory } from './categories.js';

/**
 * Decision types the agent can make
 * - guide: Provide troubleshooting guidance to the user
 * - resolve: Mark the issue as resolved
 * - escalate: Escalate to human IT support
 * - request_approval: Request approval for privileged action (future)
 */
export type AgentDecision = 'guide' | 'resolve' | 'escalate' | 'request_approval';

/**
 * Severity levels for ticket classification
 */
export type TicketSeverity = 'low' | 'medium' | 'high';

/**
 * A single troubleshooting step provided by the agent
 */
export interface TroubleshootingStep {
  step_number: number;
  instruction: string;
  expected_outcome: string;
}

/**
 * Proposed privileged action (future feature)
 * The agent can propose actions, but NEVER execute them directly
 */
export interface PrivilegedAction {
  /** The type of privileged action (e.g., password.reset, account.disable) */
  action: string;
  /** Target of the action (e.g., user ID, email) */
  target: string;
  /** Justification for why this action is needed */
  justification: string;
}

/**
 * Escalation summary when the agent decides to escalate
 */
export interface EscalationSummary {
  /** Primary reason for escalation */
  reason: string;
  /** Detailed context for the IT support team */
  details: string;
}

/**
 * The complete agent response structure
 * All agent outputs MUST conform to this interface
 */
export interface AgentResponse {
  /** The decision made by the agent */
  decision: AgentDecision;

  /** Classified ticket category */
  category: TicketCategory;

  /** Assessed severity level */
  severity: TicketSeverity;

  /** Clarifying questions to ask the user (max 4) */
  clarifying_questions: string[];

  /** Step-by-step troubleshooting instructions */
  troubleshooting_steps: TroubleshootingStep[];

  /** Proposed privileged action (null in MVP) */
  proposed_privileged_action: PrivilegedAction | null;

  /** Escalation details (null if not escalating) */
  escalation_summary: EscalationSummary | null;
}

/**
 * Validation result for agent responses
 */
export interface AgentResponseValidation {
  valid: boolean;
  errors: string[];
  sanitized?: AgentResponse;
}

/**
 * Validates an agent response object
 */
export function validateAgentResponse(response: unknown): AgentResponseValidation {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be an object'] };
  }

  const r = response as Record<string, unknown>;

  // Validate decision
  const validDecisions: AgentDecision[] = ['guide', 'resolve', 'escalate', 'request_approval'];
  if (!validDecisions.includes(r['decision'] as AgentDecision)) {
    errors.push(`Invalid decision: must be one of ${validDecisions.join(', ')}`);
  }

  // Validate category
  const validCategories: TicketCategory[] = [
    'login_password',
    'email',
    'network_wifi',
    'vpn',
    'software_installation',
    'hardware',
    'security',
  ];
  if (!validCategories.includes(r['category'] as TicketCategory)) {
    errors.push(`Invalid category: must be one of ${validCategories.join(', ')}`);
  }

  // Validate severity
  const validSeverities: TicketSeverity[] = ['low', 'medium', 'high'];
  if (!validSeverities.includes(r['severity'] as TicketSeverity)) {
    errors.push(`Invalid severity: must be one of ${validSeverities.join(', ')}`);
  }

  // Validate clarifying_questions
  if (!Array.isArray(r['clarifying_questions'])) {
    errors.push('clarifying_questions must be an array');
  } else if (r['clarifying_questions'].length > 4) {
    errors.push('clarifying_questions must have at most 4 items');
  }

  // Validate troubleshooting_steps
  if (!Array.isArray(r['troubleshooting_steps'])) {
    errors.push('troubleshooting_steps must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? (response as AgentResponse) : undefined,
  };
}
