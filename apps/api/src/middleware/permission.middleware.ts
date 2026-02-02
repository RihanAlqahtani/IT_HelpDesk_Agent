/**
 * Permission Middleware
 *
 * Enforces permission checks for protected routes.
 * In MVP, all privileged actions are disabled but checks still exist.
 */

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { isAuthenticated, AuthenticatedRequest } from './auth.middleware.js';
import type { Permission, PermissionCheckResult } from '@it-helpdesk/shared';
import { isPrivilegedPermission, PERMISSION_INFO } from '@it-helpdesk/shared';

/**
 * Create a middleware that requires a specific permission
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Ensure user is authenticated
      if (!isAuthenticated(req)) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const result = await checkPermission(req.user, permission);

      if (!result.allowed) {
        // Log the permission denial
        await logPermissionDenial(req, permission, result.reason || 'Unknown');

        if (result.permissionDisabled) {
          res.status(403).json({
            error: 'Forbidden',
            code: 'PRIVILEGED_ACTION_DISABLED',
            message: 'This action is not currently enabled',
          });
          return;
        }

        res.status(403).json({
          error: 'Forbidden',
          message: result.reason || 'Insufficient permissions',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission check failed',
      });
    }
  };
}

/**
 * Check if a user has a specific permission
 */
export async function checkPermission(
  user: AuthenticatedRequest['user'],
  permission: Permission
): Promise<PermissionCheckResult> {
  // Check if permission exists in database
  const { data: permissionRecord, error } = await supabaseAdmin
    .from('it_permissions')
    .select('*')
    .eq('name', permission)
    .single();

  if (error || !permissionRecord) {
    return {
      allowed: false,
      reason: 'Permission not found',
    };
  }

  // Check if permission is privileged and disabled
  if (permissionRecord.is_privileged && !permissionRecord.is_enabled) {
    // MVP: privileged actions are disabled
    return {
      allowed: false,
      reason: 'This privileged action is not enabled in the current deployment',
      permissionDisabled: true,
    };
  }

  // Check feature flag for privileged actions
  if (permissionRecord.is_privileged && !env.FEATURE_PRIVILEGED_ACTIONS) {
    return {
      allowed: false,
      reason: 'Privileged actions are disabled by feature flag',
      permissionDisabled: true,
    };
  }

  // Check if user's role has this permission
  const hasPermission = user.permissions.includes(permission);

  if (!hasPermission) {
    return {
      allowed: false,
      reason: `Role '${user.role}' does not have permission '${permission}'`,
      missingRole: true,
    };
  }

  return { allowed: true };
}

/**
 * Log permission denial for audit purposes
 */
async function logPermissionDenial(
  req: Request,
  permission: Permission,
  reason: string
): Promise<void> {
  if (!isAuthenticated(req)) return;

  try {
    await supabaseAdmin.from('it_audit_logs').insert({
      user_id: req.user.id,
      action: 'PERMISSION_DENIED',
      resource_type: 'permission',
      details: {
        permission,
        reason,
        path: req.path,
        method: req.method,
      },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });
  } catch (error) {
    console.error('Failed to log permission denial:', error);
  }
}

/**
 * Middleware that requires the user to be an IT staff member
 */
export function requireITStaff(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (!['it_support', 'it_admin'].includes(req.user.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'IT staff access required',
    });
    return;
  }

  next();
}

/**
 * Middleware that requires the user to be an IT admin
 */
export function requireITAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'it_admin') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'IT admin access required',
    });
    return;
  }

  next();
}
