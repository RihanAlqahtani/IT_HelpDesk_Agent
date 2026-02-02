/**
 * Authentication Middleware
 *
 * Validates JWT tokens and attaches user information to the request.
 * Uses Supabase Auth for token verification.
 */

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import type { UserSession, UserRole } from '@it-helpdesk/shared';

/**
 * Extended Express Request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user: UserSession;
  accessToken: string;
}

/**
 * Type guard to check if request is authenticated
 */
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

/**
 * Authentication middleware
 * Validates the JWT token and fetches user profile with role
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    // Verify token with Supabase
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // Fetch user profile with role using service role (bypasses RLS)
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('it_users')
      .select(
        `
        id,
        email,
        full_name,
        is_active,
        it_roles (
          name
        )
      `
      )
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User profile not found',
      });
      return;
    }

    // Check if user is active
    if (!userProfile.is_active) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'User account is disabled',
      });
      return;
    }

    // Extract role name from Supabase join (handles both array and single object)
    const rolesData = userProfile.it_roles as unknown as { name: string } | { name: string }[] | null;
    const roleName = Array.isArray(rolesData) ? rolesData[0]?.name : rolesData?.name;

    if (!roleName) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User role not found',
      });
      return;
    }

    // Fetch user permissions using role_id from the profile
    const { data: roleData } = await supabaseAdmin
      .from('it_roles')
      .select('id')
      .eq('name', roleName)
      .single();

    const { data: permissions } = await supabaseAdmin
      .from('it_role_permissions')
      .select('it_permissions(name)')
      .eq('role_id', roleData?.id || '');

    const permissionNames = (permissions || []).map((p) => {
      const permData = p.it_permissions as unknown as { name: string } | { name: string }[] | null;
      return Array.isArray(permData) ? permData[0]?.name : permData?.name;
    }).filter((name): name is string => !!name);

    // Attach user session to request
    const userSession: UserSession = {
      id: userProfile.id,
      email: userProfile.email,
      fullName: userProfile.full_name,
      role: roleName as UserRole,
      permissions: permissionNames as import('@it-helpdesk/shared').Permission[],
      isActive: userProfile.is_active,
    };

    (req as AuthenticatedRequest).user = userSession;
    (req as AuthenticatedRequest).accessToken = token;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is present, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  // If token is present, validate it
  await authMiddleware(req, res, next);
}
