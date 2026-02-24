/**
 * HR Routes
 *
 * Handles HR onboarding, employee management, and dashboard endpoints.
 *
 * Public endpoints (access code protected):
 * - POST /onboard/submit — Public onboarding form submission
 *
 * HR-authenticated endpoints:
 * - GET /employees — List all employees
 * - GET /employees/:id — Get employee details
 * - PATCH /employees/:id — Modify employee (department, job title)
 * - POST /employees/:id/offboard — Offboard employee
 * - POST /employees/:id/resend-credentials — Resend credentials
 * - GET /dashboard/stats — Dashboard statistics
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requireHR } from '../middleware/permission.middleware.js';
import { hrOnboardingService } from '../services/hr-onboarding.service.js';

const router = Router();

// =============================================================================
// RATE LIMITER FOR PUBLIC ONBOARDING ENDPOINT
// =============================================================================

const onboardingRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 submissions per hour per IP
  keyGenerator: (req: Request) => `onboard:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many onboarding submissions. Please try again later.',
    });
  },
});

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const onboardingSchema = z.object({
  accessCode: z.string().min(1, 'Access code is required'),
  firstName: z.string().min(1, 'First name is required').max(64),
  lastName: z.string().min(1, 'Last name is required').max(64),
  personalEmail: z.string().email('Invalid email address'),
  jobTitle: z.string().max(128).optional(),
  department: z.string().max(128).optional(),
});

const modifySchema = z.object({
  jobTitle: z.string().max(128).optional(),
  department: z.string().max(128).optional(),
});

const offboardSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

// =============================================================================
// PUBLIC ENDPOINTS (NO AUTH — ACCESS CODE PROTECTED)
// =============================================================================

/**
 * POST /onboard/submit
 * Public onboarding form submission
 */
router.post('/onboard/submit', onboardingRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = onboardingSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await hrOnboardingService.onboardEmployee(
      parsed.data,
      req.ip || undefined
    );

    if (!result.success) {
      const status = result.errorCode === 'INVALID_ACCESS_CODE' ? 403
        : result.errorCode === 'DUPLICATE_EMAIL' ? 409
        : result.errorCode === 'UPN_UNAVAILABLE' ? 409
        : 500;

      res.status(status).json({
        error: result.error,
        errorCode: result.errorCode,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: result.data,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('[HR Routes] Onboarding submission error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again.',
    });
  }
});

// =============================================================================
// HR-AUTHENTICATED ENDPOINTS
// =============================================================================

/**
 * GET /employees
 * List all employees (with optional filters)
 */
router.get('/employees', authMiddleware, requireHR, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await hrOnboardingService.getEmployees({ status, search });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[HR Routes] Get employees error:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/**
 * GET /employees/:id
 * Get employee details
 */
router.get('/employees/:id', authMiddleware, requireHR, async (req: Request, res: Response) => {
  try {
    const result = await hrOnboardingService.getEmployee(req.params.id!);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[HR Routes] Get employee error:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

/**
 * PATCH /employees/:id
 * Modify employee (department, job title)
 */
router.patch('/employees/:id', authMiddleware, requireHR, async (req: Request, res: Response) => {
  try {
    const parsed = modifySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const authReq = req as unknown as AuthenticatedRequest;
    const result = await hrOnboardingService.modifyEmployee(
      req.params.id!,
      parsed.data,
      authReq.user.id
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Employee updated successfully' });
  } catch (error) {
    console.error('[HR Routes] Modify employee error:', error);
    res.status(500).json({ error: 'Failed to modify employee' });
  }
});

/**
 * POST /employees/:id/offboard
 * Offboard an employee (disable Azure AD account)
 */
router.post('/employees/:id/offboard', authMiddleware, requireHR, async (req: Request, res: Response) => {
  try {
    const parsed = offboardSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const authReq = req as unknown as AuthenticatedRequest;
    const result = await hrOnboardingService.offboardEmployee(
      req.params.id!,
      authReq.user.id,
      parsed.data.reason
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Employee offboarded successfully' });
  } catch (error) {
    console.error('[HR Routes] Offboard error:', error);
    res.status(500).json({ error: 'Failed to offboard employee' });
  }
});

/**
 * POST /employees/:id/resend-credentials
 * Resend credentials to employee's personal email
 */
router.post('/employees/:id/resend-credentials', authMiddleware, requireHR, async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const result = await hrOnboardingService.resendCredentials(
      req.params.id!,
      authReq.user.id
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Credentials resent successfully' });
  } catch (error) {
    console.error('[HR Routes] Resend credentials error:', error);
    res.status(500).json({ error: 'Failed to resend credentials' });
  }
});

/**
 * GET /dashboard/stats
 * HR dashboard statistics
 */
router.get('/dashboard/stats', authMiddleware, requireHR, async (_req: Request, res: Response) => {
  try {
    const result = await hrOnboardingService.getDashboardStats();

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[HR Routes] Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
