/**
 * Ticket Routes
 *
 * Handles all ticket-related API endpoints.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ticketService, CreateTicketInput, UpdateTicketInput, TicketFilters } from '../services/ticket.service.js';
import { authMiddleware, isAuthenticated, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requirePermission, requireITStaff } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '@it-helpdesk/shared';

const router = Router();

// All ticket routes require authentication
router.use(authMiddleware);

/**
 * Create ticket schema
 */
const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  category: z.enum([
    'login_password',
    'email',
    'network_wifi',
    'vpn',
    'software_installation',
    'hardware',
    'security',
  ]),
  severity: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Update ticket schema
 */
const updateTicketSchema = z.object({
  status: z
    .enum(['open', 'in_progress', 'awaiting_approval', 'escalated', 'resolved', 'closed'])
    .optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  resolution: z.string().max(5000).optional(),
  escalationReason: z.string().max(1000).optional(),
});

/**
 * POST /api/tickets
 * Create a new ticket
 */
router.post(
  '/',
  requirePermission(PERMISSIONS.TICKET_CREATE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = createTicketSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const ticket = await ticketService.createTicket(
        req.user.id,
        validation.data as CreateTicketInput,
        req.accessToken
      );

      res.status(201).json(ticket);
    } catch (error) {
      console.error('Create ticket error:', error);
      res.status(500).json({ error: 'Failed to create ticket' });
    }
  }
);

/**
 * GET /api/tickets
 * List tickets (filtered based on user role)
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.TICKET_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

      const filters: TicketFilters = {};

      // Non-IT staff can only see their own tickets
      if (!['it_support', 'it_admin'].includes(req.user.role)) {
        filters.userId = req.user.id;
      } else {
        // IT staff can filter by various fields
        if (req.query.userId) filters.userId = req.query.userId as string;
        if (req.query.assignedTo) filters.assignedTo = req.query.assignedTo as string;
      }

      if (req.query.status) {
        const statuses = (req.query.status as string).split(',');
        filters.status = statuses.length === 1 ? statuses[0] as any : statuses as any;
      }

      if (req.query.category) filters.category = req.query.category as any;
      if (req.query.severity) filters.severity = req.query.severity as string;

      const { tickets, total } = await ticketService.listTickets(
        req.accessToken,
        filters,
        page,
        pageSize
      );

      res.json({
        tickets,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (error) {
      console.error('List tickets error:', error);
      res.status(500).json({ error: 'Failed to list tickets' });
    }
  }
);

/**
 * GET /api/tickets/stats
 * Get ticket statistics (IT staff only)
 */
router.get('/stats', requireITStaff, async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await ticketService.getTicketStats();
    res.json(stats);
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({ error: 'Failed to get ticket statistics' });
  }
});

/**
 * GET /api/tickets/:id/details
 * Get detailed ticket info for IT staff (includes user info)
 */
router.get(
  '/:id/details',
  requireITStaff,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = req.params.id;
      if (!ticketId) {
        res.status(400).json({ error: 'Ticket ID is required' });
        return;
      }

      const details = await ticketService.getTicketWithDetails(ticketId);

      if (!details) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }

      res.json(details);
    } catch (error) {
      console.error('Get ticket details error:', error);
      res.status(500).json({ error: 'Failed to get ticket details' });
    }
  }
);

/**
 * GET /api/tickets/:id
 * Get a single ticket
 */
router.get(
  '/:id',
  requirePermission(PERMISSIONS.TICKET_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ticketId = req.params.id;
      if (!ticketId) {
        res.status(400).json({ error: 'Ticket ID is required' });
        return;
      }

      const ticket = await ticketService.getTicket(ticketId, (req as AuthenticatedRequest).accessToken);

      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }

      res.json(ticket);
    } catch (error) {
      console.error('Get ticket error:', error);
      res.status(500).json({ error: 'Failed to get ticket' });
    }
  }
);

/**
 * PATCH /api/tickets/:id
 * Update a ticket
 */
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.TICKET_RESPOND),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = updateTicketSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const ticketId = req.params.id;
      if (!ticketId) {
        res.status(400).json({ error: 'Ticket ID is required' });
        return;
      }

      const ticket = await ticketService.updateTicket(
        ticketId,
        validation.data as UpdateTicketInput,
        req.user.id,
        (req as AuthenticatedRequest).accessToken
      );

      res.json(ticket);
    } catch (error) {
      console.error('Update ticket error:', error);
      res.status(500).json({ error: 'Failed to update ticket' });
    }
  }
);

/**
 * POST /api/tickets/:id/escalate
 * Escalate a ticket
 */
router.post(
  '/:id/escalate',
  requirePermission(PERMISSIONS.TICKET_ESCALATE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { reason, details } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Escalation reason is required' });
        return;
      }

      const ticketId = req.params.id;
      if (!ticketId) {
        res.status(400).json({ error: 'Ticket ID is required' });
        return;
      }

      const ticket = await ticketService.escalateTicket(
        ticketId,
        reason,
        details || '',
        req.user.id,
        (req as AuthenticatedRequest).accessToken
      );

      res.json(ticket);
    } catch (error) {
      console.error('Escalate ticket error:', error);
      res.status(500).json({ error: 'Failed to escalate ticket' });
    }
  }
);

/**
 * POST /api/tickets/:id/resolve
 * Resolve a ticket
 */
router.post(
  '/:id/resolve',
  requirePermission(PERMISSIONS.TICKET_CLOSE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { resolution } = req.body;

      if (!resolution) {
        res.status(400).json({ error: 'Resolution is required' });
        return;
      }

      const ticketId = req.params.id;
      if (!ticketId) {
        res.status(400).json({ error: 'Ticket ID is required' });
        return;
      }

      const ticket = await ticketService.resolveTicket(
        ticketId,
        resolution,
        req.user.id,
        (req as AuthenticatedRequest).accessToken
      );

      res.json(ticket);
    } catch (error) {
      console.error('Resolve ticket error:', error);
      res.status(500).json({ error: 'Failed to resolve ticket' });
    }
  }
);

export default router;
