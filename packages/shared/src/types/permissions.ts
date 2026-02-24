/**
 * Permission System Types
 *
 * Defines the role-based access control (RBAC) system.
 * In MVP, all privileged permissions are disabled but checks still exist.
 */

/**
 * System roles
 */
export type UserRole = 'employee' | 'it_support' | 'it_admin' | 'system_service' | 'hr';

/**
 * Permission capability names
 */
export type Permission =
  // Ticket permissions (MVP - enabled)
  | 'ticket.read'
  | 'ticket.create'
  | 'ticket.respond'
  | 'ticket.escalate'
  | 'ticket.close'
  // Privileged permissions (MVP - disabled)
  | 'account.create'
  | 'account.modify'
  | 'account.disable'
  | 'password.reset'
  | 'permission.modify'
  | 'onboarding.execute'
  | 'offboarding.execute'
  | 'employee.modify';

/**
 * Permission metadata
 */
export interface PermissionInfo {
  name: Permission;
  description: string;
  /** Whether this is a privileged action requiring special handling */
  isPrivileged: boolean;
  /** Whether this permission is enabled in the current deployment */
  isEnabledInMVP: boolean;
  /** Minimum role required for this permission */
  minimumRole: UserRole;
}

/**
 * Role metadata
 */
export interface RoleInfo {
  name: UserRole;
  description: string;
  /** Hierarchy level (higher = more permissions) */
  level: number;
  /** Whether this role can access the admin console */
  canAccessAdmin: boolean;
}

/**
 * User session with role information
 */
export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permissionDisabled?: boolean;
  missingRole?: boolean;
}

/**
 * Ticket status types
 */
export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'awaiting_approval'
  | 'escalated'
  | 'resolved'
  | 'closed';

/**
 * Base ticket interface
 */
export interface Ticket {
  id: string;
  ticketNumber: number;
  userId: string;
  assignedTo?: string;
  category: string;
  severity: string;
  status: TicketStatus;
  subject: string;
  description: string;
  resolution?: string;
  escalatedAt?: Date;
  escalationReason?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation message in a ticket
 */
export interface ConversationMessage {
  id: string;
  ticketId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  agentResponse?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * Approval request (future feature)
 */
export interface ApprovalRequest {
  id: string;
  ticketId: string;
  requestedBy: string;
  approvedBy?: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
  justification?: string;
  reviewedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}
