/**
 * Ticket Service
 *
 * Handles all ticket-related operations.
 * Uses RLS for access control via user client.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, createUserClient } from '../config/supabase.js';
import { logAudit } from '../middleware/audit.middleware.js';
import type { Ticket, TicketStatus, TicketCategory } from '@it-helpdesk/shared';

/**
 * Create ticket input
 */
export interface CreateTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  severity?: 'low' | 'medium' | 'high';
}

/**
 * Update ticket input
 */
export interface UpdateTicketInput {
  status?: TicketStatus;
  assignedTo?: string;
  resolution?: string;
  escalationReason?: string;
}

/**
 * Ticket filters for listing
 */
export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  category?: TicketCategory;
  userId?: string;
  assignedTo?: string;
  severity?: string;
}

/**
 * Ticket Service class
 */
export class TicketService {
  /**
   * Create a new ticket
   */
  async createTicket(
    userId: string,
    input: CreateTicketInput,
    accessToken: string
  ): Promise<Ticket> {
    const userClient = createUserClient(accessToken);

    const { data, error } = await userClient
      .from('it_tickets')
      .insert({
        user_id: userId,
        subject: input.subject,
        description: input.description,
        category: input.category,
        severity: input.severity || 'medium',
        status: 'open',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create ticket:', error);
      throw new Error('Failed to create ticket');
    }

    await logAudit({
      userId,
      action: 'TICKET_CREATE',
      resourceType: 'ticket',
      resourceId: data.id,
      details: {
        category: input.category,
        severity: input.severity,
      },
    });

    return this.mapToTicket(data);
  }

  /**
   * Get a ticket by ID
   */
  async getTicket(ticketId: string, accessToken: string): Promise<Ticket | null> {
    const userClient = createUserClient(accessToken);

    const { data, error } = await userClient
      .from('it_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error('Failed to fetch ticket');
    }

    return this.mapToTicket(data);
  }

  /**
   * Get detailed ticket info for IT staff (includes user info)
   */
  async getTicketWithDetails(ticketId: string): Promise<{
    ticket: Ticket;
    user: { id: string; email: string; fullName: string; department?: string } | null;
  } | null> {
    // Use admin client to get full details
    const { data: ticketData, error: ticketError } = await supabaseAdmin
      .from('it_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError) {
      if (ticketError.code === 'PGRST116') {
        return null;
      }
      throw new Error('Failed to fetch ticket');
    }

    // Get user info
    const { data: userData } = await supabaseAdmin
      .from('it_users')
      .select('id, email, full_name, department')
      .eq('id', ticketData.user_id)
      .single();

    return {
      ticket: this.mapToTicket(ticketData),
      user: userData ? {
        id: userData.id,
        email: userData.email,
        fullName: userData.full_name,
        department: userData.department,
      } : null,
    };
  }

  /**
   * List tickets with optional filters
   */
  async listTickets(
    accessToken: string,
    filters?: TicketFilters,
    page = 1,
    pageSize = 20
  ): Promise<{ tickets: Ticket[]; total: number }> {
    const userClient = createUserClient(accessToken);

    let query = userClient.from('it_tickets').select('*', { count: 'exact' });

    // Apply filters
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters?.assignedTo) {
      query = query.eq('assigned_to', filters.assignedTo);
    }

    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }

    // Pagination
    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error('Failed to list tickets');
    }

    return {
      tickets: (data || []).map(this.mapToTicket),
      total: count || 0,
    };
  }

  /**
   * Update a ticket
   */
  async updateTicket(
    ticketId: string,
    input: UpdateTicketInput,
    userId: string,
    accessToken: string
  ): Promise<Ticket> {
    const userClient = createUserClient(accessToken);

    const updateData: Record<string, unknown> = {};

    if (input.status) {
      updateData.status = input.status;

      // Set timestamps based on status
      if (input.status === 'escalated') {
        updateData.escalated_at = new Date().toISOString();
        updateData.escalation_reason = input.escalationReason;
      } else if (input.status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolution = input.resolution;
      } else if (input.status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      }
    }

    if (input.assignedTo !== undefined) {
      updateData.assigned_to = input.assignedTo;
    }

    if (input.resolution) {
      updateData.resolution = input.resolution;
    }

    const { data, error } = await userClient
      .from('it_tickets')
      .update(updateData)
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update ticket');
    }

    await logAudit({
      userId,
      action: 'TICKET_UPDATE',
      resourceType: 'ticket',
      resourceId: ticketId,
      details: updateData,
    });

    return this.mapToTicket(data);
  }

  /**
   * Escalate a ticket (uses admin client to bypass RLS for system actions)
   */
  async escalateTicket(
    ticketId: string,
    reason: string,
    details: string,
    userId: string,
    accessToken: string
  ): Promise<Ticket> {
    // Use admin client for escalation since this is a system-initiated action
    // Regular employees can't update ticket status via RLS
    const { data, error } = await supabaseAdmin
      .from('it_tickets')
      .update({
        status: 'escalated',
        escalated_at: new Date().toISOString(),
        escalation_reason: `${reason}: ${details}`,
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('Failed to escalate ticket:', error);
      throw new Error('Failed to escalate ticket');
    }

    const ticket = this.mapToTicket(data);

    await logAudit({
      userId,
      action: 'TICKET_ESCALATE',
      resourceType: 'ticket',
      resourceId: ticketId,
      details: { reason, details },
    });

    return ticket;
  }

  /**
   * Set ticket to awaiting_approval status (uses admin client to bypass RLS)
   * Used when an approval request is created for privileged actions
   */
  async setTicketAwaitingApproval(
    ticketId: string,
    userId: string
  ): Promise<Ticket> {
    // Use admin client since employees can't update status to awaiting_approval via RLS
    const { data, error } = await supabaseAdmin
      .from('it_tickets')
      .update({
        status: 'awaiting_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('Failed to set ticket awaiting approval:', error);
      throw new Error('Failed to set ticket awaiting approval');
    }

    const ticket = this.mapToTicket(data);

    await logAudit({
      userId,
      action: 'TICKET_AWAITING_APPROVAL',
      resourceType: 'ticket',
      resourceId: ticketId,
      details: { previousStatus: 'in_progress', newStatus: 'awaiting_approval' },
    });

    return ticket;
  }

  /**
   * Resolve a ticket (uses admin client for system-initiated resolutions)
   */
  async resolveTicket(
    ticketId: string,
    resolution: string,
    userId: string,
    accessToken: string
  ): Promise<Ticket> {
    // Use admin client for resolution since this may be agent-initiated
    const { data, error } = await supabaseAdmin
      .from('it_tickets')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution,
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('Failed to resolve ticket:', error);
      throw new Error('Failed to resolve ticket');
    }

    const ticket = this.mapToTicket(data);

    await logAudit({
      userId,
      action: 'TICKET_RESOLVE',
      resourceType: 'ticket',
      resourceId: ticketId,
      details: { resolution },
    });

    return ticket;
  }

  /**
   * Get ticket statistics (for IT staff)
   */
  async getTicketStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    escalated: number;
    resolved: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    // Use admin client for aggregation queries
    const { data: statusCounts } = await supabaseAdmin
      .from('it_tickets')
      .select('status')
      .then((result) => {
        const counts: Record<string, number> = {};
        for (const row of result.data || []) {
          counts[row.status] = (counts[row.status] || 0) + 1;
        }
        return { data: counts };
      });

    const { data: categoryCounts } = await supabaseAdmin
      .from('it_tickets')
      .select('category')
      .then((result) => {
        const counts: Record<string, number> = {};
        for (const row of result.data || []) {
          counts[row.category] = (counts[row.category] || 0) + 1;
        }
        return { data: counts };
      });

    const { data: severityCounts } = await supabaseAdmin
      .from('it_tickets')
      .select('severity')
      .then((result) => {
        const counts: Record<string, number> = {};
        for (const row of result.data || []) {
          counts[row.severity] = (counts[row.severity] || 0) + 1;
        }
        return { data: counts };
      });

    const total = Object.values(statusCounts || {}).reduce((a, b) => a + b, 0);

    return {
      total,
      open: statusCounts?.['open'] || 0,
      inProgress: statusCounts?.['in_progress'] || 0,
      escalated: statusCounts?.['escalated'] || 0,
      resolved: (statusCounts?.['resolved'] || 0) + (statusCounts?.['closed'] || 0),
      byCategory: categoryCounts || {},
      bySeverity: severityCounts || {},
    };
  }

  /**
   * Map database row to Ticket type
   */
  private mapToTicket(row: Record<string, unknown>): Ticket {
    return {
      id: row.id as string,
      ticketNumber: row.ticket_number as number,
      userId: row.user_id as string,
      assignedTo: row.assigned_to as string | undefined,
      category: row.category as string,
      severity: row.severity as string,
      status: row.status as TicketStatus,
      subject: row.subject as string,
      description: row.description as string,
      resolution: row.resolution as string | undefined,
      escalatedAt: row.escalated_at ? new Date(row.escalated_at as string) : undefined,
      escalationReason: row.escalation_reason as string | undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Export singleton instance
export const ticketService = new TicketService();
