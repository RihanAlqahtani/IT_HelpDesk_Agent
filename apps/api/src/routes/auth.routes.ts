/**
 * Auth Routes
 *
 * Handles authentication-related endpoints.
 * Uses Supabase Auth for actual authentication.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { authMiddleware, isAuthenticated } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/ratelimit.middleware.js';
import { logAudit } from '../middleware/audit.middleware.js';

const router = Router();

/**
 * Sign up schema
 */
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100),
  department: z.string().max(100).optional(),
});

/**
 * Sign in schema
 */
const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post(
  '/signup',
  authRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = signUpSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const { email, password, fullName, department } = validation.data;

      // Create auth user with Supabase
      const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (authError || !authData.user) {
        res.status(400).json({
          error: 'Registration failed',
          message: authError?.message || 'Unknown error',
        });
        return;
      }

      // Get the default employee role
      const { data: roleData, error: roleError } = await supabaseAdmin
        .from('it_roles')
        .select('id')
        .eq('name', 'employee')
        .single();

      if (roleError || !roleData) {
        res.status(500).json({ error: 'Failed to assign role' });
        return;
      }

      // Create user profile
      const { error: profileError } = await supabaseAdmin.from('it_users').insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        department,
        role_id: roleData.id,
        is_active: true,
      });

      if (profileError) {
        console.error('Failed to create profile:', profileError);
        // Clean up auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        res.status(500).json({ error: 'Failed to create user profile' });
        return;
      }

      await logAudit({
        userId: authData.user.id,
        action: 'USER_SIGNUP',
        resourceType: 'user',
        resourceId: authData.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        message: 'Registration successful',
        user: {
          id: authData.user.id,
          email,
          fullName,
        },
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

/**
 * POST /api/auth/signin
 * Sign in a user
 */
router.post(
  '/signin',
  authRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = signInSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const { email, password } = validation.data;

      // Sign in with Supabase
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        await logAudit({
          action: 'LOGIN_FAILED',
          resourceType: 'authentication',
          details: { email, reason: error?.message },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });

        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid email or password',
        });
        return;
      }

      // Fetch user profile
      const { data: profile } = await supabaseAdmin
        .from('it_users')
        .select('full_name, department, is_active, it_roles(name)')
        .eq('id', data.user.id)
        .single();

      if (!profile?.is_active) {
        res.status(403).json({
          error: 'Account disabled',
          message: 'Your account has been disabled',
        });
        return;
      }

      // Update last login
      await supabaseAdmin
        .from('it_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id);

      await logAudit({
        userId: data.user.id,
        action: 'LOGIN_SUCCESS',
        resourceType: 'authentication',
        resourceId: data.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Extract role name from Supabase join (handles both array and single object)
      const rolesData = profile?.it_roles as unknown as { name: string } | { name: string }[] | null;
      const roleName = Array.isArray(rolesData) ? rolesData[0]?.name : rolesData?.name;

      // Debug: log the role being returned
      console.log('[Auth] Sign-in successful for:', {
        email,
        userId: data.user.id,
        roleName,
        rolesData,
      });

      res.json({
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: profile?.full_name,
          role: roleName,
        },
        session: {
          accessToken: data.session?.access_token,
          refreshToken: data.session?.refresh_token,
          expiresAt: data.session?.expires_at,
        },
      });
    } catch (error) {
      console.error('Signin error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
);

/**
 * POST /api/auth/signout
 * Sign out the current user
 */
router.post('/signout', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await logAudit({
      userId: req.user.id,
      action: 'LOGOUT',
      resourceType: 'authentication',
      resourceId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Sign out is handled client-side, but we log it
    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({ error: 'Sign out failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
        permissions: req.user.permissions,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const { data, error } = await supabaseClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    res.json({
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * POST /api/auth/sso-profile
 * Get or create user profile for SSO login.
 * Called by the /auth/callback page after Supabase completes the OAuth flow.
 * If the user has no it_users profile (first SSO login), one is auto-created
 * with the 'employee' role.
 */
router.post('/sso-profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing authorization header' });
      return;
    }
    const token = authHeader.slice(7);

    // Verify token with Supabase
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
      return;
    }

    // Try to fetch existing profile
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('it_users')
      .select('id, email, full_name, department, is_active, it_roles(name)')
      .eq('id', authUser.id)
      .single();

    // If no profile exists, auto-create one (first SSO login)
    if (profileError?.code === 'PGRST116' || !profile) {
      const { data: roleData, error: roleError } = await supabaseAdmin
        .from('it_roles')
        .select('id')
        .eq('name', 'employee')
        .single();

      if (roleError || !roleData) {
        res.status(500).json({ error: 'Failed to assign default role' });
        return;
      }

      // Extract name from Azure AD user metadata
      const fullName =
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        authUser.user_metadata?.preferred_username?.split('@')[0] ||
        authUser.email?.split('@')[0] ||
        'Unknown User';

      const { error: insertError } = await supabaseAdmin.from('it_users').insert({
        id: authUser.id,
        email: authUser.email!,
        full_name: fullName,
        department: null,
        role_id: roleData.id,
        is_active: true,
      });

      if (insertError) {
        // Handle race condition: profile may have been created by a concurrent request
        if (insertError.code === '23505') {
          const { data: existingProfile } = await supabaseAdmin
            .from('it_users')
            .select('id, email, full_name, department, is_active, it_roles(name)')
            .eq('id', authUser.id)
            .single();
          if (existingProfile) {
            profile = existingProfile;
          } else {
            res.status(500).json({ error: 'Failed to create user profile' });
            return;
          }
        } else {
          console.error('Failed to auto-create SSO profile:', insertError);
          res.status(500).json({ error: 'Failed to create user profile' });
          return;
        }
      } else {
        // Fetch the newly created profile
        const { data: newProfile, error: fetchError } = await supabaseAdmin
          .from('it_users')
          .select('id, email, full_name, department, is_active, it_roles(name)')
          .eq('id', authUser.id)
          .single();

        if (fetchError || !newProfile) {
          res.status(500).json({ error: 'Failed to fetch new profile' });
          return;
        }

        profile = newProfile;

        await logAudit({
          userId: authUser.id,
          action: 'SSO_FIRST_LOGIN',
          resourceType: 'user',
          resourceId: authUser.id,
          details: { provider: 'azure', email: authUser.email },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
      }
    }

    if (!profile.is_active) {
      res.status(403).json({ error: 'Account disabled', message: 'Your account has been disabled' });
      return;
    }

    // Update last login
    await supabaseAdmin
      .from('it_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authUser.id);

    // Extract role name
    const rolesData = profile.it_roles as unknown as { name: string } | { name: string }[] | null;
    const roleName = Array.isArray(rolesData) ? rolesData[0]?.name : rolesData?.name;

    // Fetch permissions
    const { data: roleData } = await supabaseAdmin
      .from('it_roles')
      .select('id')
      .eq('name', roleName)
      .single();

    const { data: permissions } = await supabaseAdmin
      .from('it_role_permissions')
      .select('it_permissions(name)')
      .eq('role_id', roleData?.id || '');

    const permissionNames = (permissions || []).map((p: any) => {
      const permData = p.it_permissions as unknown as { name: string } | { name: string }[] | null;
      return Array.isArray(permData) ? permData[0]?.name : permData?.name;
    }).filter((name: any): name is string => !!name);

    await logAudit({
      userId: authUser.id,
      action: 'SSO_LOGIN_SUCCESS',
      resourceType: 'authentication',
      resourceId: authUser.id,
      details: { provider: 'azure' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: roleName,
        permissions: permissionNames,
      },
    });
  } catch (error) {
    console.error('SSO profile error:', error);
    res.status(500).json({ error: 'SSO authentication failed' });
  }
});

export default router;
