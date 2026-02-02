/**
 * Audit Middleware
 *
 * Logs all API requests for audit purposes.
 * Sensitive data is redacted before logging.
 */

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { isAuthenticated } from './auth.middleware.js';
import { redactPII } from '../utils/pii-redactor.js';

/**
 * Actions that should be logged
 */
const AUDITABLE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Paths that should always be logged regardless of method
 */
const ALWAYS_AUDIT_PATHS = [
  '/api/agent',
  '/api/tickets',
  '/api/admin',
  '/api/privileged',
];

/**
 * Paths that should never be logged (health checks, etc.)
 */
const NEVER_AUDIT_PATHS = ['/health', '/api/health', '/ready'];

/**
 * Audit middleware
 * Logs requests after they complete
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip non-auditable paths
  if (NEVER_AUDIT_PATHS.some((path) => req.path.startsWith(path))) {
    next();
    return;
  }

  // Capture start time
  const startTime = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end to capture response
  const originalEndFn = res.end.bind(res);
  (res.end as unknown) = function (this: Response, ...args: unknown[]): Response {
    // Restore original end
    res.end = originalEnd;

    // Log the request asynchronously
    const shouldAudit =
      AUDITABLE_METHODS.includes(req.method) ||
      ALWAYS_AUDIT_PATHS.some((path) => req.path.startsWith(path));

    if (shouldAudit) {
      logAuditEntry(req, res, startTime).catch((error) => {
        console.error('Failed to log audit entry:', error);
      });
    }

    // Call original end
    return (originalEndFn as Function).apply(this, args) as Response;
  };

  next();
}

/**
 * Log an audit entry to the database
 */
async function logAuditEntry(
  req: Request,
  res: Response,
  startTime: number
): Promise<void> {
  try {
    const duration = Date.now() - startTime;

    // Determine action from method and path
    const action = determineAction(req.method, req.path);

    // Determine resource type from path
    const resourceType = determineResourceType(req.path);

    // Extract resource ID from path or body
    const resourceId = extractResourceId(req);

    // Redact sensitive data from request body
    const redactedBody = req.body ? redactPII(JSON.stringify(req.body)) : null;

    await supabaseAdmin.from('it_audit_logs').insert({
      user_id: isAuthenticated(req) ? req.user.id : null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        body: redactedBody ? JSON.parse(redactedBody) : undefined,
        status_code: res.statusCode,
        duration_ms: duration,
      },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw - audit failures shouldn't break the request
  }
}

/**
 * Determine the action based on HTTP method and path
 */
function determineAction(method: string, path: string): string {
  const pathParts = path.split('/').filter(Boolean);

  // Special cases
  if (path.includes('/agent/chat')) return 'AGENT_CHAT';
  if (path.includes('/escalate')) return 'TICKET_ESCALATE';
  if (path.includes('/resolve')) return 'TICKET_RESOLVE';
  if (path.includes('/approve')) return 'APPROVAL_APPROVE';
  if (path.includes('/reject')) return 'APPROVAL_REJECT';

  // Generic actions based on method
  switch (method) {
    case 'GET':
      return `${pathParts[1]?.toUpperCase() || 'RESOURCE'}_READ`;
    case 'POST':
      return `${pathParts[1]?.toUpperCase() || 'RESOURCE'}_CREATE`;
    case 'PUT':
    case 'PATCH':
      return `${pathParts[1]?.toUpperCase() || 'RESOURCE'}_UPDATE`;
    case 'DELETE':
      return `${pathParts[1]?.toUpperCase() || 'RESOURCE'}_DELETE`;
    default:
      return 'UNKNOWN_ACTION';
  }
}

/**
 * Determine the resource type from the path
 */
function determineResourceType(path: string): string {
  const pathParts = path.split('/').filter(Boolean);

  // Skip 'api' prefix if present
  const resourcePart = pathParts[0] === 'api' ? pathParts[1] : pathParts[0];

  switch (resourcePart) {
    case 'tickets':
      return 'ticket';
    case 'agent':
      return 'agent_conversation';
    case 'users':
      return 'user';
    case 'admin':
      return 'admin';
    case 'privileged':
      return 'privileged_action';
    case 'auth':
      return 'authentication';
    default:
      return resourcePart || 'unknown';
  }
}

/**
 * Extract resource ID from path or body
 */
function extractResourceId(req: Request): string | null {
  // Try to extract from path (e.g., /api/tickets/:id)
  const pathParts = req.path.split('/').filter(Boolean);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const part of pathParts) {
    if (uuidRegex.test(part)) {
      return part;
    }
  }

  // Try to extract from body
  if (req.body?.id && uuidRegex.test(req.body.id)) {
    return req.body.id;
  }

  if (req.body?.ticket_id && uuidRegex.test(req.body.ticket_id)) {
    return req.body.ticket_id;
  }

  return null;
}

/**
 * Direct audit log function for use in services
 */
export async function logAudit(entry: {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    // Redact PII from details
    const redactedDetails = entry.details
      ? JSON.parse(redactPII(JSON.stringify(entry.details)))
      : undefined;

    await supabaseAdmin.from('it_audit_logs').insert({
      user_id: entry.userId || null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      details: redactedDetails,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    });
  } catch (error) {
    console.error('Direct audit log error:', error);
  }
}
