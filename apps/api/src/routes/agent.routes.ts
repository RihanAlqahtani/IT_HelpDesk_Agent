/**
 * Agent Routes
 *
 * Handles AI agent chat interactions.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { agentService } from '../services/agent.service.js';
import { authMiddleware, isAuthenticated } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { agentRateLimiter } from '../middleware/ratelimit.middleware.js';
import { PERMISSIONS } from '@it-helpdesk/shared';

const router = Router();

// All agent routes require authentication
router.use(authMiddleware);

/**
 * Start conversation schema (first message - creates ticket)
 */
const startConversationSchema = z.object({
  message: z.string().min(10).max(5000),
});

/**
 * Chat message schema
 */
const chatSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1).max(5000),
});

/**
 * POST /api/agent/start
 * Start a new conversation - AI classifies the issue and creates a ticket
 */
router.post(
  '/start',
  agentRateLimiter,
  requirePermission(PERMISSIONS.TICKET_CREATE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = startConversationSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const result = await agentService.startConversation(
        validation.data.message,
        req.user.id,
        req.accessToken
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Start conversation error:', error);
      res.status(500).json({ error: 'Failed to start conversation' });
    }
  }
);

/**
 * POST /api/agent/chat
 * Send a message to the AI agent
 */
router.post(
  '/chat',
  agentRateLimiter,
  requirePermission(PERMISSIONS.TICKET_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = chatSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validation.error.errors,
        });
        return;
      }

      const result = await agentService.chat(
        {
          ticketId: validation.data.ticketId,
          message: validation.data.message,
        },
        req.user.id,
        req.accessToken
      );

      res.json(result);
    } catch (error) {
      console.error('Agent chat error:', error);

      // Handle specific errors
      if (error instanceof Error) {
        if (error.message === 'Ticket not found') {
          res.status(404).json({ error: 'Ticket not found' });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to process message' });
    }
  }
);

/**
 * GET /api/agent/history/:ticketId
 * Get conversation history for a ticket
 */
router.get(
  '/history/:ticketId',
  requirePermission(PERMISSIONS.TICKET_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { ticketId } = req.params;

      if (!ticketId || !z.string().uuid().safeParse(ticketId).success) {
        res.status(400).json({ error: 'Invalid ticket ID' });
        return;
      }

      const history = await agentService.getConversationHistory(ticketId, req.accessToken);

      res.json({ messages: history });
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({ error: 'Failed to get conversation history' });
    }
  }
);

/**
 * GET /api/agent/summary/:ticketId
 * Get interaction summary for a ticket
 */
router.get(
  '/summary/:ticketId',
  requirePermission(PERMISSIONS.TICKET_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { ticketId } = req.params;

      if (!ticketId || !z.string().uuid().safeParse(ticketId).success) {
        res.status(400).json({ error: 'Invalid ticket ID' });
        return;
      }

      const summary = await agentService.getInteractionSummary(ticketId, req.accessToken);

      res.json(summary);
    } catch (error) {
      console.error('Get summary error:', error);
      res.status(500).json({ error: 'Failed to get interaction summary' });
    }
  }
);

export default router;
