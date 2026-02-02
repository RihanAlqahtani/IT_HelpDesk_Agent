/**
 * Approval Service
 *
 * Handles approval workflows for privileged actions.
 *
 * This service:
 * - Creates approval requests for privileged actions
 * - Gets pending approvals for IT Admin review
 * - Approves/rejects requests
 * - Executes approved actions (password reset, account disable/enable)
 */

import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { azureADService } from '../azure-ad.service.js';
import { ticketService } from '../ticket.service.js';

/**
 * Approval request status
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';

/**
 * Approval request
 */
export interface ApprovalRequest {
  id: string;
  ticketId: string;
  requestedBy: string;
  requestedByName?: string;
  requestedByEmail?: string;
  approvedBy?: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  status: ApprovalStatus;
  justification?: string;
  rejectionReason?: string;
  reviewedAt?: Date;
  executedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  // Extended fields from joins
  ticketSubject?: string;
}

/**
 * Approval request with execution result
 */
export interface ApprovalExecutionResult {
  success: boolean;
  error?: string;
  data?: {
    temporaryPassword?: string;
    message?: string;
  };
}

/**
 * Approval Service class
 */
export class ApprovalService {
  private readonly DEFAULT_EXPIRATION_HOURS = 24;

  /**
   * Check if privileged actions are enabled (we use this instead of approval workflows flag)
   */
  isEnabled(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS;
  }

  /**
   * Create a new approval request
   */
  async createApprovalRequest(
    ticketId: string,
    requestedBy: string,
    actionType: string,
    actionPayload: Record<string, unknown>,
    expirationHours?: number
  ): Promise<{ success: boolean; data?: { approvalId: string }; error?: string }> {
    if (!this.isEnabled()) {
      await logAudit({
        userId: requestedBy,
        action: 'APPROVAL_REQUEST_BLOCKED',
        resourceType: 'approval_request',
        resourceId: ticketId,
        details: {
          actionType,
          reason: 'Privileged actions disabled',
        },
      });

      return {
        success: false,
        error: 'Privileged actions are not enabled in this deployment',
      };
    }

    const hours = expirationHours || this.DEFAULT_EXPIRATION_HOURS;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from('it_approval_requests')
      .insert({
        ticket_id: ticketId,
        requested_by: requestedBy,
        action_type: actionType,
        action_payload: actionPayload,
        status: 'pending',
        justification: actionPayload.justification || 'Password reset requested',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create approval request:', error);
      return { success: false, error: 'Failed to create approval request' };
    }

    await logAudit({
      userId: requestedBy,
      action: 'APPROVAL_REQUEST_CREATED',
      resourceType: 'approval_request',
      resourceId: data.id,
      details: {
        ticketId,
        actionType,
      },
    });

    return { success: true, data: { approvalId: data.id } };
  }

  /**
   * Get pending approval requests with user details
   */
  async getPendingRequests(): Promise<ApprovalRequest[]> {
    if (!this.isEnabled()) {
      return [];
    }

    // Get pending requests with user info
    const { data, error } = await supabaseAdmin
      .from('it_approval_requests')
      .select(`
        *,
        requester:requested_by(full_name, email),
        ticket:ticket_id(subject)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch pending requests:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      requestedBy: row.requested_by,
      requestedByName: (row.requester as any)?.full_name || row.action_payload?.requestedByName,
      requestedByEmail: (row.requester as any)?.email || row.action_payload?.requestedByEmail,
      approvedBy: row.approved_by,
      actionType: row.action_type,
      actionPayload: row.action_payload,
      status: row.status,
      justification: row.justification,
      rejectionReason: row.rejection_reason,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
      ticketSubject: (row.ticket as any)?.subject || row.action_payload?.ticketSubject,
    }));
  }

  /**
   * Get a single approval request by ID
   */
  async getApprovalRequest(approvalId: string): Promise<ApprovalRequest | null> {
    const { data, error } = await supabaseAdmin
      .from('it_approval_requests')
      .select(`
        *,
        requester:requested_by(full_name, email),
        ticket:ticket_id(subject)
      `)
      .eq('id', approvalId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      ticketId: data.ticket_id,
      requestedBy: data.requested_by,
      requestedByName: (data.requester as any)?.full_name || data.action_payload?.requestedByName,
      requestedByEmail: (data.requester as any)?.email || data.action_payload?.requestedByEmail,
      approvedBy: data.approved_by,
      actionType: data.action_type,
      actionPayload: data.action_payload,
      status: data.status,
      justification: data.justification,
      rejectionReason: data.rejection_reason,
      reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
      executedAt: data.executed_at ? new Date(data.executed_at) : undefined,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      createdAt: new Date(data.created_at),
      ticketSubject: (data.ticket as any)?.subject || data.action_payload?.ticketSubject,
    };
  }

  /**
   * Approve a pending request and execute the action
   */
  async approveRequest(
    approvalId: string,
    approvedBy: string
  ): Promise<ApprovalExecutionResult> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Privileged actions are not enabled' };
    }

    // Get the request
    const request = await this.getApprovalRequest(approvalId);
    if (!request) {
      return { success: false, error: 'Approval request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request already ${request.status}` };
    }

    if (request.expiresAt && request.expiresAt < new Date()) {
      await supabaseAdmin
        .from('it_approval_requests')
        .update({ status: 'expired' })
        .eq('id', approvalId);
      return { success: false, error: 'Request has expired' };
    }

    // Update to approved
    const { error: updateError } = await supabaseAdmin
      .from('it_approval_requests')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', approvalId);

    if (updateError) {
      return { success: false, error: 'Failed to approve request' };
    }

    await logAudit({
      userId: approvedBy,
      action: 'APPROVAL_REQUEST_APPROVED',
      resourceType: 'approval_request',
      resourceId: approvalId,
    });

    // Execute the action
    const executionResult = await this.executeApprovedAction(request, approvedBy);

    if (executionResult.success) {
      // Update to executed
      await supabaseAdmin
        .from('it_approval_requests')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      // Add a system message to the conversation about the result
      await this.addExecutionResultToConversation(
        request.ticketId,
        request.actionType,
        executionResult,
        request.requestedByName || 'User'
      );
    }

    return executionResult;
  }

  /**
   * Execute an approved privileged action
   */
  private async executeApprovedAction(
    request: ApprovalRequest,
    executedBy: string
  ): Promise<ApprovalExecutionResult> {
    const payload = request.actionPayload;

    switch (request.actionType) {
      case 'password_reset': {
        const targetEmail = payload.targetEmail as string;
        if (!targetEmail) {
          return { success: false, error: 'Target email not specified' };
        }

        const result = await azureADService.resetPassword(
          targetEmail,
          executedBy,
          request.ticketId
        );

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              temporaryPassword: result.data.temporaryPassword,
              message: `Password reset successful for ${targetEmail}`,
            },
          };
        }

        return { success: false, error: result.error || 'Password reset failed' };
      }

      case 'account_disable': {
        const targetEmail = payload.targetEmail as string;
        const reason = payload.justification as string || 'Requested via IT Helpdesk';

        const result = await azureADService.disableAccount(
          targetEmail,
          reason,
          executedBy,
          request.ticketId
        );

        if (result.success) {
          return {
            success: true,
            data: { message: `Account disabled for ${targetEmail}` },
          };
        }

        return { success: false, error: result.error || 'Account disable failed' };
      }

      case 'account_enable': {
        const targetEmail = payload.targetEmail as string;
        const reason = payload.justification as string || 'Requested via IT Helpdesk';

        const result = await azureADService.enableAccount(
          targetEmail,
          reason,
          executedBy,
          request.ticketId
        );

        if (result.success) {
          return {
            success: true,
            data: { message: `Account enabled for ${targetEmail}` },
          };
        }

        return { success: false, error: result.error || 'Account enable failed' };
      }

      default:
        return { success: false, error: `Unknown action type: ${request.actionType}` };
    }
  }

  /**
   * Add execution result message to the ticket conversation
   */
  private async addExecutionResultToConversation(
    ticketId: string,
    actionType: string,
    result: ApprovalExecutionResult,
    userName: string
  ): Promise<void> {
    let content = '';

    if (actionType === 'password_reset' && result.success && result.data?.temporaryPassword) {
      content = `✅ **Password Reset Approved and Completed!**

Hi ${userName}! Your password reset has been approved by IT.

🔑 **Your temporary password is:** \`${result.data.temporaryPassword}\`

**Next steps:**
1. Go to your login page
2. Enter your email address
3. Use the temporary password above
4. You will be prompted to create a new password
5. Choose a strong password (at least 8 characters, with numbers and special characters)

⚠️ **Important:** This temporary password must be changed on your first login.

If you have any issues, please reply to this conversation.`;
    } else if (result.success) {
      content = `✅ **Action Completed**\n\n${result.data?.message || 'The requested action has been completed successfully.'}`;
    } else {
      content = `❌ **Action Failed**\n\nThe requested action could not be completed: ${result.error}\n\nPlease contact IT support for assistance.`;
    }

    // Save the message to conversation history
    await supabaseAdmin
      .from('it_conversation_history')
      .insert({
        ticket_id: ticketId,
        role: 'system',
        content,
        agent_response: {
          decision: result.success ? 'resolve' : 'escalate',
          actionResult: result,
        },
      });

    // Update ticket status based on result
    if (result.success && actionType === 'password_reset') {
      // Mark as resolved since password was reset
      await supabaseAdmin
        .from('it_tickets')
        .update({
          status: 'resolved',
          resolution: 'Password reset completed via AI assistance',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', ticketId);
    }
  }

  /**
   * Reject a pending request
   */
  async rejectRequest(
    approvalId: string,
    rejectedBy: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Privileged actions are not enabled' };
    }

    const request = await this.getApprovalRequest(approvalId);
    if (!request) {
      return { success: false, error: 'Approval request not found' };
    }

    const { error: updateError } = await supabaseAdmin
      .from('it_approval_requests')
      .update({
        status: 'rejected',
        approved_by: rejectedBy,
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .eq('status', 'pending');

    if (updateError) {
      return { success: false, error: 'Failed to reject request' };
    }

    // Add rejection message to conversation
    await supabaseAdmin
      .from('it_conversation_history')
      .insert({
        ticket_id: request.ticketId,
        role: 'system',
        content: `❌ **Request Rejected**\n\nYour ${request.actionType.replace('_', ' ')} request was not approved.\n\n**Reason:** ${reason}\n\nPlease contact IT support if you believe this was in error.`,
      });

    // Update ticket status
    await supabaseAdmin
      .from('it_tickets')
      .update({ status: 'in_progress' })
      .eq('id', request.ticketId);

    await logAudit({
      userId: rejectedBy,
      action: 'APPROVAL_REQUEST_REJECTED',
      resourceType: 'approval_request',
      resourceId: approvalId,
      details: { reason },
    });

    return { success: true };
  }
}

// Export singleton instance
export const approvalService = new ApprovalService();
