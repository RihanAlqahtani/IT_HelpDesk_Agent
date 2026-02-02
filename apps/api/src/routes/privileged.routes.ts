/**
 * Privileged Action Routes
 *
 * Handles privileged operations like account management and password resets.
 *
 * These routes integrate with Azure AD via the account and password services.
 * All operations require:
 * - Authentication (JWT)
 * - IT Admin role
 * - Feature flag enabled (FEATURE_PRIVILEGED_ACTIONS)
 * - Azure AD configuration
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, isAuthenticated } from '../middleware/auth.middleware.js';
import { requirePermission, requireITAdmin } from '../middleware/permission.middleware.js';
import { privilegedRateLimiter } from '../middleware/ratelimit.middleware.js';
import { accountService } from '../services/privileged/account.service.js';
import { passwordService } from '../services/privileged/password.service.js';
import { approvalService } from '../services/privileged/approval.service.js';
import { azureADService } from '../services/azure-ad.service.js';
import { env, isAzureADConfigured } from '../config/env.js';
import { PERMISSIONS } from '@it-helpdesk/shared';

const router = Router();

// All privileged routes require authentication and IT admin role
router.use(authMiddleware);
router.use(privilegedRateLimiter);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const passwordResetSchema = z.object({
  targetEmail: z.string().email('Invalid email format'),
  ticketId: z.string().uuid('Invalid ticket ID'),
  forceChangeOnLogin: z.boolean().default(true),
  notifyUser: z.boolean().default(false),
});

const disableAccountSchema = z.object({
  targetEmail: z.string().email('Invalid email format'),
  ticketId: z.string().uuid('Invalid ticket ID'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

const enableAccountSchema = z.object({
  targetEmail: z.string().email('Invalid email format'),
  ticketId: z.string().uuid('Invalid ticket ID'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Middleware to check if privileged actions are enabled
 */
function requirePrivilegedEnabled(req: Request, res: Response, next: Function): void {
  if (!env.FEATURE_PRIVILEGED_ACTIONS) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'PRIVILEGED_ACTIONS_DISABLED',
      message: 'Privileged actions are not enabled in this deployment',
    });
    return;
  }
  next();
}

/**
 * Middleware to check if Azure AD is configured
 */
function requireAzureAD(req: Request, res: Response, next: Function): void {
  if (!isAzureADConfigured()) {
    res.status(503).json({
      error: 'Service Unavailable',
      code: 'AZURE_AD_NOT_CONFIGURED',
      message: 'Azure AD is not configured. Contact your administrator.',
    });
    return;
  }
  next();
}

// =============================================================================
// ACCOUNT MANAGEMENT
// =============================================================================

/**
 * POST /api/privileged/accounts
 * Create a new user account
 *
 * Note: Account creation is not yet implemented
 */
router.post(
  '/accounts',
  requirePrivilegedEnabled,
  requireAzureAD,
  requirePermission(PERMISSIONS.ACCOUNT_CREATE),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ticketId = req.body.ticketId as string | undefined;
    if (!ticketId) {
      res.status(400).json({ error: 'ticketId is required' });
      return;
    }

    const result = await accountService.createAccount(
      req.body,
      req.user.id,
      ticketId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  }
);

/**
 * PATCH /api/privileged/accounts/:userId
 * Modify a user account
 *
 * Note: Account modification is not yet implemented
 */
router.patch(
  '/accounts/:userId',
  requirePrivilegedEnabled,
  requireAzureAD,
  requirePermission(PERMISSIONS.ACCOUNT_MODIFY),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ticketId = req.body.ticketId as string | undefined;
    if (!ticketId) {
      res.status(400).json({ error: 'ticketId is required' });
      return;
    }

    const result = await accountService.modifyAccount(
      {
        targetEmail: req.params.userId ?? '',
        changes: req.body.changes,
      },
      req.user.id,
      ticketId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  }
);

/**
 * POST /api/privileged/accounts/disable
 * Disable a user account
 *
 * Body: { targetEmail, ticketId, reason }
 */
router.post(
  '/accounts/disable',
  requirePrivilegedEnabled,
  requireAzureAD,
  requirePermission(PERMISSIONS.ACCOUNT_DISABLE),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate request body
    const validation = disableAccountSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { targetEmail, ticketId, reason } = validation.data;

    const result = await accountService.disableAccount(
      { targetEmail, reason },
      req.user.id,
      ticketId
    );

    if (!result.success) {
      const statusCode = result.data?.errorCode === 'ADMIN_PROTECTED' ? 403 : 400;
      res.status(statusCode).json({
        error: result.error,
        code: result.data?.errorCode,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Account disabled successfully',
      data: result.data,
    });
  }
);

/**
 * POST /api/privileged/accounts/enable
 * Enable a user account
 *
 * Body: { targetEmail, ticketId, reason }
 */
router.post(
  '/accounts/enable',
  requirePrivilegedEnabled,
  requireAzureAD,
  requirePermission(PERMISSIONS.ACCOUNT_DISABLE), // Same permission for enable/disable
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate request body
    const validation = enableAccountSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { targetEmail, ticketId, reason } = validation.data;

    const result = await accountService.enableAccount(
      { targetEmail, reason },
      req.user.id,
      ticketId
    );

    if (!result.success) {
      res.status(400).json({
        error: result.error,
        code: result.data?.errorCode,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Account enabled successfully',
      data: result.data,
    });
  }
);

/**
 * GET /api/privileged/accounts/lookup
 * Look up a user in Azure AD by email
 *
 * Query: ?email=user@domain.com
 */
router.get(
  '/accounts/lookup',
  requirePrivilegedEnabled,
  requireAzureAD,
  requireITAdmin,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const email = req.query.email as string;
    if (!email) {
      res.status(400).json({ error: 'Email query parameter is required' });
      return;
    }

    const result = await azureADService.getUser(email);

    if (!result.success) {
      res.status(404).json({
        error: result.error || 'User not found',
        code: result.errorCode,
      });
      return;
    }

    res.json({
      success: true,
      user: result.data,
    });
  }
);

/**
 * GET /api/privileged/accounts/search
 * Search for users in Azure AD
 *
 * Query: ?query=john&limit=10
 */
router.get(
  '/accounts/search',
  requirePrivilegedEnabled,
  requireAzureAD,
  requireITAdmin,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const query = req.query.query as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!query) {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }

    if (limit > 50) {
      res.status(400).json({ error: 'Limit cannot exceed 50' });
      return;
    }

    const result = await azureADService.searchUsers(query, limit);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'Search failed',
      });
      return;
    }

    res.json({
      success: true,
      users: result.data,
      count: result.data?.length || 0,
    });
  }
);

// =============================================================================
// PASSWORD MANAGEMENT
// =============================================================================

/**
 * POST /api/privileged/passwords/reset
 * Reset a user's password
 *
 * Body: { targetEmail, ticketId, forceChangeOnLogin?, notifyUser? }
 */
router.post(
  '/passwords/reset',
  requirePrivilegedEnabled,
  requireAzureAD,
  requirePermission(PERMISSIONS.PASSWORD_RESET),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate request body
    const validation = passwordResetSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await passwordService.resetPassword(
      validation.data,
      req.user.id,
      validation.data.ticketId
    );

    if (!result.success) {
      const statusCode = result.data?.errorCode === 'ADMIN_PROTECTED' ? 403 : 400;
      res.status(statusCode).json({
        error: result.error,
        code: result.data?.errorCode,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        temporaryPassword: result.data?.temporaryPassword,
        forceChangeOnNextLogin: result.data?.forceChangeOnNextLogin,
        targetDisplayName: result.data?.targetDisplayName,
      },
    });
  }
);

// =============================================================================
// APPROVAL WORKFLOWS
// =============================================================================

/**
 * GET /api/privileged/approvals
 * Get pending approval requests with employee details
 */
router.get('/approvals', requireITAdmin, async (req: Request, res: Response): Promise<void> => {
  if (!env.FEATURE_PRIVILEGED_ACTIONS) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'PRIVILEGED_ACTIONS_DISABLED',
      message: 'Privileged actions are not enabled',
    });
    return;
  }

  const requests = await approvalService.getPendingRequests();

  // Format for frontend display
  const formattedRequests = requests.map(req => ({
    id: req.id,
    ticketId: req.ticketId,
    ticketSubject: req.ticketSubject,
    actionType: req.actionType,
    actionTypeDisplay: req.actionType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    targetEmail: req.actionPayload?.targetEmail,
    requestedBy: {
      id: req.requestedBy,
      name: req.requestedByName || 'Unknown User',
      email: req.requestedByEmail,
    },
    justification: req.justification,
    status: req.status,
    createdAt: req.createdAt,
    expiresAt: req.expiresAt,
  }));

  res.json({
    success: true,
    requests: formattedRequests,
    count: formattedRequests.length,
  });
});

/**
 * POST /api/privileged/approvals/:id/approve
 * Approve a pending request and execute the action
 */
router.post(
  '/approvals/:id/approve',
  requireITAdmin,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!env.FEATURE_PRIVILEGED_ACTIONS) {
      res.status(403).json({
        error: 'Forbidden',
        code: 'PRIVILEGED_ACTIONS_DISABLED',
        message: 'Privileged actions are not enabled',
      });
      return;
    }

    const approvalId = req.params.id;
    if (!approvalId) {
      res.status(400).json({ error: 'Approval ID is required' });
      return;
    }

    const result = await approvalService.approveRequest(approvalId, req.user.id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Return the execution result (includes temp password for password reset)
    res.json({
      success: true,
      message: 'Request approved and executed successfully',
      data: result.data,
    });
  }
);

/**
 * POST /api/privileged/approvals/:id/reject
 * Reject a pending request
 */
router.post(
  '/approvals/:id/reject',
  requireITAdmin,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!env.FEATURE_PRIVILEGED_ACTIONS) {
      res.status(403).json({
        error: 'Forbidden',
        code: 'PRIVILEGED_ACTIONS_DISABLED',
        message: 'Privileged actions are not enabled',
      });
      return;
    }

    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' });
      return;
    }

    const approvalId = req.params.id;
    if (!approvalId) {
      res.status(400).json({ error: 'Approval ID is required' });
      return;
    }

    const result = await approvalService.rejectRequest(approvalId, req.user.id, reason);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: 'Request rejected successfully',
    });
  }
);

// =============================================================================
// STATUS ENDPOINT
// =============================================================================

/**
 * GET /api/privileged/status
 * Get the status of privileged features and Azure AD
 */
router.get('/status', requireITAdmin, (req: Request, res: Response): void => {
  const azureConfigured = isAzureADConfigured();

  res.json({
    privilegedActions: {
      enabled: env.FEATURE_PRIVILEGED_ACTIONS,
      message: env.FEATURE_PRIVILEGED_ACTIONS
        ? 'Privileged actions are enabled'
        : 'Privileged actions are disabled (MVP mode)',
    },
    approvalWorkflows: {
      enabled: env.FEATURE_APPROVAL_WORKFLOWS,
      message: env.FEATURE_APPROVAL_WORKFLOWS
        ? 'Approval workflows are enabled'
        : 'Approval workflows are disabled (MVP mode)',
    },
    emailEscalation: {
      enabled: env.FEATURE_EMAIL_ESCALATION,
      message: env.FEATURE_EMAIL_ESCALATION
        ? 'Email escalation is enabled'
        : 'Email escalation is disabled (MVP mode)',
    },
    azureAD: {
      configured: azureConfigured,
      message: azureConfigured
        ? 'Azure AD is configured and ready'
        : 'Azure AD is not configured',
    },
    capabilities: {
      passwordReset: env.FEATURE_PRIVILEGED_ACTIONS && azureConfigured,
      accountDisable: env.FEATURE_PRIVILEGED_ACTIONS && azureConfigured,
      accountEnable: env.FEATURE_PRIVILEGED_ACTIONS && azureConfigured,
      accountCreate: false, // Not yet implemented
      accountModify: false, // Not yet implemented
      userLookup: azureConfigured,
      userSearch: azureConfigured,
    },
  });
});

export default router;
