/**
 * Agent Service
 *
 * Orchestrates AI agent interactions with the LLM.
 * Handles conversation flow, context management, and safety enforcement.
 *
 * SECURITY: All agent responses are validated and constrained before being returned.
 */

import { supabaseAdmin, createUserClient } from '../config/supabase.js';
import { llmService, TicketContext, ConversationMessage } from './llm.service.js';
import { ticketService } from './ticket.service.js';
import { approvalService } from './privileged/approval.service.js';
import { logAudit } from '../middleware/audit.middleware.js';
import { redactPII } from '../utils/pii-redactor.js';
import type { AgentResponse, TicketCategory, ConversationMessage as SharedConversationMessage } from '@it-helpdesk/shared';
import { requiresEscalation } from '@it-helpdesk/shared';

/**
 * Chat request from user
 */
export interface AgentChatRequest {
  ticketId: string;
  message: string;
}

/**
 * Chat response to user
 */
export interface AgentChatResponse {
  response: AgentResponse;
  conversationId: string;
  ticketUpdated: boolean;
  /** The saved agent message - use this for immediate display to avoid read-after-write issues */
  agentMessage: {
    id: string;
    content: string;
    createdAt: string;
  };
}

/**
 * Start conversation response
 */
export interface StartConversationResponse {
  ticket: {
    id: string;
    ticketNumber: number;
    userId: string;
    category: string;
    severity: string;
    status: string;
    subject: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  };
  response: AgentResponse;
  conversationId: string;
}

/**
 * Agent Service class
 */
export class AgentService {
  /**
   * Start a new conversation - AI classifies the issue and creates a ticket
   */
  async startConversation(
    message: string,
    userId: string,
    accessToken: string
  ): Promise<StartConversationResponse> {
    // 1. Get initial classification from LLM
    const initialContext: TicketContext = {
      ticketId: 'new',
      subject: '',
      description: message,
    };

    const agentResponse = await llmService.getInitialClassification(message);

    // 2. Create the ticket with AI-determined classification
    const ticket = await ticketService.createTicket(userId, {
      subject: agentResponse.generated_subject || this.generateSubject(message),
      description: message,
      category: agentResponse.category as TicketCategory,
      severity: agentResponse.severity as 'low' | 'medium' | 'high',
    }, accessToken);

    // 3. Save user message to conversation history
    await this.saveMessage(ticket.id, 'user', message, userId);

    // 4. Save agent response to conversation history
    const savedAgentMessage = await this.saveAgentMessage(ticket.id, agentResponse, userId);
    const conversationId = savedAgentMessage.id;

    // 5. Handle immediate escalation if needed (hardware/security)
    if (agentResponse.decision === 'escalate' && agentResponse.escalation_summary) {
      await ticketService.escalateTicket(
        ticket.id,
        agentResponse.escalation_summary.reason,
        agentResponse.escalation_summary.details,
        userId,
        accessToken
      );
    } else if (agentResponse.decision === 'guide') {
      // Update status to in_progress
      await ticketService.updateTicket(
        ticket.id,
        { status: 'in_progress' },
        userId,
        accessToken
      );
    }

    // 6. Log the interaction
    await logAudit({
      userId,
      action: 'AGENT_START_CONVERSATION',
      resourceType: 'ticket',
      resourceId: ticket.id,
      details: {
        decision: agentResponse.decision,
        category: agentResponse.category,
        severity: agentResponse.severity,
        autoEscalated: agentResponse.decision === 'escalate',
      },
    });

    // 7. Refresh ticket to get updated status
    const updatedTicket = await ticketService.getTicket(ticket.id, accessToken);

    return {
      ticket: updatedTicket || ticket,
      response: agentResponse,
      conversationId,
    };
  }

  /**
   * Generate a subject from the user's message
   */
  private generateSubject(message: string): string {
    // Take first 100 chars and clean up
    const cleaned = message.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 100) return cleaned;
    return cleaned.substring(0, 97) + '...';
  }

  /**
   * Process a chat message from the user
   */
  async chat(
    request: AgentChatRequest,
    userId: string,
    accessToken: string
  ): Promise<AgentChatResponse> {
    // 1. Verify ticket exists and user has access
    const ticket = await ticketService.getTicket(request.ticketId, accessToken);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // 2. Get conversation history
    const history = await this.getConversationHistory(request.ticketId, accessToken);

    // 3. Save user message to history
    const userMessageId = await this.saveMessage(
      request.ticketId,
      'user',
      request.message,
      userId
    );

    // 4. Build context for LLM
    const context: TicketContext = {
      ticketId: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category as TicketCategory,
      previousStepsAttempted: this.extractPreviousSteps(history),
    };

    // 5. Convert history to LLM format and compute turn count
    const llmHistory: ConversationMessage[] = history.map((msg) => ({
      role: msg.role as 'user' | 'agent' | 'system',
      content: msg.content,
    }));

    // Add current message
    llmHistory.push({
      role: 'user',
      content: request.message,
    });

    // Compute user turn count for conversation pacing
    const userTurnCount = history.filter(m => m.role === 'user').length + 1;

    // 6. Get agent response from LLM
    const agentResponse = await llmService.getAgentResponse(context, llmHistory, userTurnCount);

    // 7. Save agent response to history
    const savedAgentMessage = await this.saveAgentMessage(
      request.ticketId,
      agentResponse,
      userId
    );

    // 8. Handle ticket updates based on decision
    const ticketUpdated = await this.handleAgentDecision(
      ticket.id,
      agentResponse,
      userId,
      accessToken
    );

    // 9. Log the interaction
    await logAudit({
      userId,
      action: 'AGENT_CHAT',
      resourceType: 'ticket',
      resourceId: ticket.id,
      details: {
        decision: agentResponse.decision,
        category: agentResponse.category,
        severity: agentResponse.severity,
        ticketUpdated,
      },
    });

    return {
      response: agentResponse,
      conversationId: savedAgentMessage.id,
      ticketUpdated,
      agentMessage: savedAgentMessage,
    };
  }

  /**
   * Get conversation history for a ticket
   */
  async getConversationHistory(
    ticketId: string,
    accessToken: string
  ): Promise<SharedConversationMessage[]> {
    const userClient = createUserClient(accessToken);

    const { data, error } = await userClient
      .from('it_conversation_history')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch conversation history:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      role: row.role as 'user' | 'agent' | 'system',
      content: row.content,
      agentResponse: row.agent_response,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Save a user message to conversation history
   */
  private async saveMessage(
    ticketId: string,
    role: 'user' | 'agent' | 'system',
    content: string,
    userId: string
  ): Promise<string> {
    // Redact PII before storage
    const redactedContent = redactPII(content);

    const { data, error } = await supabaseAdmin
      .from('it_conversation_history')
      .insert({
        ticket_id: ticketId,
        role,
        content: redactedContent,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save message:', error);
      throw new Error('Failed to save message');
    }

    return data.id;
  }

  /**
   * Save agent response to conversation history
   * Returns the saved message details for immediate frontend display
   */
  private async saveAgentMessage(
    ticketId: string,
    response: AgentResponse,
    userId: string
  ): Promise<{ id: string; content: string; createdAt: string }> {
    // Build readable content from response
    const content = this.buildAgentMessageContent(response);

    const { data, error } = await supabaseAdmin
      .from('it_conversation_history')
      .insert({
        ticket_id: ticketId,
        role: 'agent',
        content,
        agent_response: response,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to save agent message:', error);
      throw new Error('Failed to save agent response');
    }

    return {
      id: data.id,
      content,
      createdAt: data.created_at,
    };
  }

  /**
   * Build human-readable message content from agent response
   */
  private buildAgentMessageContent(response: AgentResponse): string {
    const parts: string[] = [];

    // Add clarifying questions
    if (response.clarifying_questions.length > 0) {
      parts.push('I have a few questions to help resolve your issue:');
      response.clarifying_questions.forEach((q, i) => {
        parts.push(`${i + 1}. ${q}`);
      });
    }

    // Add troubleshooting steps
    if (response.troubleshooting_steps.length > 0) {
      parts.push('\nPlease try the following steps:');
      response.troubleshooting_steps.forEach((step) => {
        parts.push(`\nStep ${step.step_number}: ${step.instruction}`);
        parts.push(`Expected result: ${step.expected_outcome}`);
      });
    }

    // Add escalation info
    if (response.decision === 'escalate' && response.escalation_summary) {
      parts.push(
        `\nI'm escalating this issue to our IT support team. Reason: ${response.escalation_summary.reason}`
      );
    }

    // Add approval request info - ALWAYS show message when decision is request_approval
    if (response.decision === 'request_approval') {
      if (response.proposed_privileged_action) {
        const action = response.proposed_privileged_action;
        if (action.action === 'password_reset') {
          parts.push('\n🔐 **Password Reset Request Submitted**');
          parts.push(`\nI've submitted a password reset request for your account (${action.target || 'your email'}).`);
          parts.push('An IT Administrator will review and approve this request shortly.');
          parts.push('\nOnce approved, you\'ll receive a temporary password right here in this chat.');
          parts.push('\n⏳ Please keep this conversation open or check back soon...');
        } else if (action.action === 'account_enable') {
          parts.push('\n🔓 **Account Enable Request Submitted**');
          parts.push(`\nI've submitted a request to enable the account (${action.target}).`);
          parts.push('An IT Administrator will review and approve this request shortly.');
        } else if (action.action === 'account_disable') {
          parts.push('\n🔒 **Account Disable Request Submitted**');
          parts.push(`\nI've submitted a request to disable the account (${action.target}).`);
          parts.push('An IT Administrator will review and approve this request shortly.');
        } else {
          // Unknown action type - still show a message
          parts.push('\n✅ **Request Submitted**');
          parts.push('\nYour request has been submitted for IT Administrator approval.');
          parts.push('\n⏳ Please wait for the approval notification...');
        }
      } else {
        // No privileged action specified - still show a message for request_approval decision
        parts.push('\n✅ **Request Submitted**');
        parts.push('\nYour request has been submitted for IT Administrator review.');
        parts.push('\n⏳ Please wait for a response...');
      }
    }

    // Add resolution info
    if (response.decision === 'resolve') {
      parts.push('\nGreat! It sounds like your issue has been resolved. Is there anything else I can help you with?');
    }

    return parts.join('\n') || 'How can I assist you further?';
  }

  /**
   * Handle ticket updates based on agent decision
   */
  private async handleAgentDecision(
    ticketId: string,
    response: AgentResponse,
    userId: string,
    accessToken: string
  ): Promise<boolean> {
    switch (response.decision) {
      case 'escalate':
        if (response.escalation_summary) {
          await ticketService.escalateTicket(
            ticketId,
            response.escalation_summary.reason,
            response.escalation_summary.details,
            userId,
            accessToken
          );
          return true;
        }
        break;

      case 'resolve':
        await ticketService.resolveTicket(
          ticketId,
          'Issue resolved through AI assistance',
          userId,
          accessToken
        );
        return true;

      case 'request_approval':
        // Create approval request for privileged action
        if (response.proposed_privileged_action) {
          await this.createApprovalRequest(ticketId, response, userId, accessToken);
          return true;
        }
        break;

      case 'guide':
        // Update ticket status to in_progress if it's open
        const ticket = await ticketService.getTicket(ticketId, accessToken);
        if (ticket && ticket.status === 'open') {
          await ticketService.updateTicket(
            ticketId,
            { status: 'in_progress' },
            userId,
            accessToken
          );
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * Create an approval request for a privileged action
   */
  private async createApprovalRequest(
    ticketId: string,
    response: AgentResponse,
    userId: string,
    accessToken: string
  ): Promise<void> {
    const action = response.proposed_privileged_action!;

    // Get user details for the approval request message
    const ticket = await ticketService.getTicket(ticketId, accessToken);
    const userClient = createUserClient(accessToken);
    const { data: userData } = await userClient
      .from('it_users')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const userName = userData?.full_name || 'Unknown User';
    const userEmail = userData?.email || 'unknown';

    // For password reset: ALWAYS use the authenticated user's email
    // This is a self-service flow - users reset their own passwords
    // Don't rely on LLM to extract email from conversation (it often returns placeholders)
    let targetEmail: string;
    if (action.action === 'password_reset') {
      // Always use the requester's email for self-service password resets
      targetEmail = userEmail;
      console.log(`Password reset request: using authenticated user's email: ${userEmail}`);
    } else {
      // For other actions, use LLM-provided target with fallback validation
      targetEmail = action.target;
      if (!targetEmail ||
          targetEmail.includes('example.com') ||
          targetEmail.includes('test.com') ||
          targetEmail === 'user@example.com' ||
          targetEmail === 'employee@company.com' ||
          !targetEmail.includes('@')) {
        console.log(`LLM returned invalid email "${action.target}", using requester email: ${userEmail}`);
        targetEmail = userEmail;
      }
    }

    // Create the approval request
    const result = await approvalService.createApprovalRequest(
      ticketId,
      userId,
      action.action,
      {
        targetEmail: targetEmail,
        justification: action.justification,
        requestedByName: userName,
        requestedByEmail: userEmail,
        ticketSubject: ticket?.subject || 'Unknown',
      }
    );

    if (result.success && result.data?.approvalId) {
      // Update ticket status to awaiting_approval (uses admin client to bypass RLS)
      await ticketService.setTicketAwaitingApproval(
        ticketId,
        userId
      );

      // Log the approval request
      await logAudit({
        userId,
        action: 'APPROVAL_REQUEST_CREATED',
        resourceType: 'approval_request',
        resourceId: result.data.approvalId,
        details: {
          ticketId,
          actionType: action.action,
          targetEmail: '[REDACTED]',
        },
      });
    }
  }

  /**
   * Extract previously attempted troubleshooting steps from history
   */
  private extractPreviousSteps(history: SharedConversationMessage[]): string[] {
    const steps: string[] = [];

    for (const msg of history) {
      if (msg.role === 'agent' && msg.agentResponse) {
        const response = msg.agentResponse as unknown as AgentResponse;
        if (response.troubleshooting_steps) {
          for (const step of response.troubleshooting_steps) {
            steps.push(step.instruction);
          }
        }
      }
    }

    return steps;
  }

  /**
   * Get a summary of agent interactions for a ticket
   */
  async getInteractionSummary(
    ticketId: string,
    accessToken: string
  ): Promise<{
    totalMessages: number;
    userMessages: number;
    agentMessages: number;
    lastDecision: string | null;
    stepsProvided: number;
  }> {
    const history = await this.getConversationHistory(ticketId, accessToken);

    let stepsProvided = 0;
    let lastDecision: string | null = null;

    for (const msg of history) {
      if (msg.role === 'agent' && msg.agentResponse) {
        const response = msg.agentResponse as unknown as AgentResponse;
        stepsProvided += response.troubleshooting_steps?.length || 0;
        lastDecision = response.decision;
      }
    }

    return {
      totalMessages: history.length,
      userMessages: history.filter((m) => m.role === 'user').length,
      agentMessages: history.filter((m) => m.role === 'agent').length,
      lastDecision,
      stepsProvided,
    };
  }
}

// Export singleton instance
export const agentService = new AgentService();
