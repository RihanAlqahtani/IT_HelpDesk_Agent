'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { ticketsAPI, agentAPI, Ticket, ConversationMessage, AgentResponse } from '@/lib/api';
import { DashboardLayout } from '@/components';

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const { session, user } = useAuthStore();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session?.accessToken) {
      loadTicketData();
    }
  }, [session?.accessToken, ticketId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Track if we should poll for updates (when awaiting approval or just changed from it)
  const [shouldPoll, setShouldPoll] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  // Determine if we should be polling
  useEffect(() => {
    if (!ticket) return;

    // Start polling when ticket enters awaiting_approval
    if (ticket.status === 'awaiting_approval') {
      setShouldPoll(true);
    }

    // Keep polling briefly after status changes from awaiting_approval
    // This ensures we fetch the temp password message that arrives after approval
    if (prevStatusRef.current === 'awaiting_approval' && ticket.status !== 'awaiting_approval') {
      // Do one final fetch to get any messages that arrived with the status change
      const fetchFinalMessages = async () => {
        if (!session?.accessToken) return;
        try {
          const historyData = await agentAPI.getHistory(session.accessToken, ticketId);
          if (historyData.messages.length > messages.length) {
            setMessages(historyData.messages);
          }
        } catch (err) {
          console.error('Final fetch error:', err);
        }
        // Stop polling after this fetch
        setShouldPoll(false);
      };
      fetchFinalMessages();
    }

    prevStatusRef.current = ticket.status;
  }, [ticket?.status, session?.accessToken, ticketId, messages.length]);

  // Poll for updates when ticket is awaiting approval
  useEffect(() => {
    if (!session?.accessToken || !ticket || !shouldPoll) return;

    const pollInterval = setInterval(async () => {
      try {
        const [ticketData, historyData] = await Promise.all([
          ticketsAPI.get(session.accessToken, ticketId),
          agentAPI.getHistory(session.accessToken, ticketId),
        ]);

        // Update ticket if status changed
        if (ticketData.status !== ticket.status) {
          setTicket(ticketData);
        }

        // Update messages if new ones arrived
        if (historyData.messages.length > messages.length) {
          setMessages(historyData.messages);

          // Check if we got a system message with password - stop polling
          const hasPasswordMessage = historyData.messages.some(
            (m: ConversationMessage) => m.role === 'system' && m.content.includes('temporary password')
          );
          if (hasPasswordMessage) {
            setShouldPoll(false);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000); // Poll every 3 seconds for faster response

    return () => clearInterval(pollInterval);
  }, [session?.accessToken, ticket?.status, ticketId, messages.length, shouldPoll]);

  const loadTicketData = async () => {
    if (!session?.accessToken) return;

    try {
      // Load ticket first - this is required
      const ticketData = await ticketsAPI.get(session.accessToken, ticketId);
      setTicket(ticketData);

      // Load conversation history separately - don't let it block ticket display
      try {
        const historyData = await agentAPI.getHistory(session.accessToken, ticketId);
        setMessages(historyData.messages);
      } catch (historyErr) {
        console.error('Failed to load conversation history:', historyErr);
        // Don't set error - ticket still displays, just no history
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Failed to load ticket. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !session?.accessToken) return;

    setSending(true);
    setError('');

    const messageContent = newMessage.trim();
    setNewMessage('');

    // Optimistically add user message
    const tempUserMessage: ConversationMessage = {
      id: 'temp-user',
      ticketId,
      role: 'user',
      content: messageContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const result = await agentAPI.chat(session.accessToken, ticketId, messageContent);

      // Use the saved agent message directly from the API response
      // This avoids read-after-write consistency issues with database fetches
      const agentMessage: ConversationMessage = {
        id: result.agentMessage.id,
        ticketId,
        role: 'agent',
        content: result.agentMessage.content,
        createdAt: result.agentMessage.createdAt,
      };

      // Replace temp user message with permanent ID and add agent response
      setMessages((prev) => {
        // Find the temp user message and keep all messages before it
        const withoutTemp = prev.filter((m) => m.id !== 'temp-user');
        // Add the user message with a proper ID (use conversationId as base)
        const userMessage: ConversationMessage = {
          id: `user-${result.conversationId}`,
          ticketId,
          role: 'user',
          content: messageContent,
          createdAt: new Date().toISOString(),
        };
        return [...withoutTemp, userMessage, agentMessage];
      });

      // Fetch updated ticket status (for status changes like awaiting_approval)
      const updatedTicket = await ticketsAPI.get(session.accessToken, ticketId);
      setTicket(updatedTicket);
    } catch (err) {
      setError('Failed to send message. Please try again.');
      // Remove optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== 'temp-user'));
      setNewMessage(messageContent);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const buildAgentContent = (response: AgentResponse): string => {
    const parts: string[] = [];

    if (response.clarifying_questions && response.clarifying_questions.length > 0) {
      parts.push("I have a few questions to help you better:");
      response.clarifying_questions.forEach((q, i) => {
        parts.push(`${i + 1}. ${q}`);
      });
    }

    if (response.troubleshooting_steps && response.troubleshooting_steps.length > 0) {
      if (parts.length > 0) parts.push('');
      parts.push("Here are some steps to try:");
      response.troubleshooting_steps.forEach((step) => {
        parts.push(`\n**Step ${step.step_number}:** ${step.instruction}`);
        parts.push(`_Expected: ${step.expected_outcome}_`);
      });
    }

    if (response.decision === 'escalate' && response.escalation_summary) {
      if (parts.length > 0) parts.push('');
      parts.push(`I'm escalating this ticket to our IT support team.`);
      parts.push(`**Reason:** ${response.escalation_summary.reason}`);
    }

    if (response.decision === 'resolve') {
      if (parts.length > 0) parts.push('');
      parts.push("It looks like your issue has been resolved. I'm marking this ticket as resolved. If you need further assistance, feel free to create a new ticket.");
    }

    // Handle password reset / privileged action approval requests
    if (response.decision === 'request_approval') {
      if (parts.length > 0) parts.push('');
      parts.push("✅ **Password Reset Request Submitted**");
      parts.push('');
      parts.push("I've submitted a password reset request on your behalf. An IT Administrator will review and approve it shortly.");
      parts.push('');
      parts.push("**What happens next:**");
      parts.push("1. An IT Admin will receive your request");
      parts.push("2. Once approved, your password will be reset automatically");
      parts.push("3. You'll receive your temporary password right here in this chat");
      parts.push('');
      parts.push("⏳ Please keep this chat open or check back soon for your new password.");
    }

    return parts.join('\n') || 'How can I help you further with this issue?';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-info/10 text-info-dark ring-info/20';
      case 'in_progress':
        return 'bg-warning/10 text-warning-dark ring-warning/20';
      case 'awaiting_approval':
        return 'bg-purple/10 text-purple-dark ring-purple/20';
      case 'escalated':
        return 'bg-danger/10 text-danger-dark ring-danger/20';
      case 'resolved':
        return 'bg-success/10 text-success-dark ring-success/20';
      case 'closed':
        return 'bg-surface-light text-body-dark ring-border-light';
      default:
        return 'bg-surface-light text-body-dark ring-border-light';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-danger bg-danger/10';
      case 'medium':
        return 'text-warning-dark bg-warning/10';
      case 'low':
        return 'text-success bg-success/10';
      default:
        return 'text-body-dark bg-surface-light';
    }
  };

  const formatCategory = (category: string) => {
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDuration = (createdAt: string, resolvedAt?: string) => {
    const start = new Date(createdAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return '< 1m';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    } else if (diffHours < 24) {
      const mins = diffMinutes % 60;
      return mins > 0 ? `${diffHours}h ${mins}m` : `${diffHours}h`;
    } else {
      const hours = diffHours % 24;
      return hours > 0 ? `${diffDays}d ${hours}h` : `${diffDays}d`;
    }
  };

  const isTicketClosed = ticket?.status === 'resolved' || ticket?.status === 'closed';
  const isITStaff = user?.role && ['it_support', 'it_admin'].includes(user.role);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <div className="spinner mx-auto mb-4 h-8 w-8"></div>
            <p className="text-sm text-text-muted">Loading ticket...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-text-gray"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-4 text-text-muted">{error || 'Ticket not found'}</p>
            <div className="mt-4 flex items-center justify-center space-x-4">
              <button
                onClick={() => {
                  setLoading(true);
                  setError('');
                  loadTicketData();
                }}
                className="text-primary-light hover:text-primary transition-colors"
              >
                Try again
              </button>
              <Link href="/dashboard" className="text-text-muted hover:text-body-dark transition-colors">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-130px)] flex-col">
        {/* Ticket header */}
        <div className="flex items-start justify-between border-b border-border-light pb-4">
          <div className="flex items-start space-x-4">
            <Link
              href="/dashboard"
              className="mt-1 rounded-lg p-1.5 text-text-gray hover:bg-surface-light hover:text-body-dark transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-heading font-bold text-primary-dark">Ticket #{ticket.ticketNumber}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusColor(
                    ticket.status
                  )}`}
                >
                  {ticket.status.replace('_', ' ')}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getSeverityColor(
                    ticket.severity
                  )}`}
                >
                  {ticket.severity} severity
                </span>
              </div>
              <p className="mt-1 text-body-dark">{ticket.subject}</p>
              <p className="mt-1 text-sm text-text-gray flex items-center space-x-2">
                <span>{formatCategory(ticket.category)}</span>
                <span>&bull;</span>
                <span>Created {new Date(ticket.createdAt).toLocaleDateString()}</span>
                <span>&bull;</span>
                <span className="flex items-center">
                  {isTicketClosed ? (
                    <svg className="h-3.5 w-3.5 text-success mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-text-gray mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className={isTicketClosed ? 'text-success' : ''}>
                    {isTicketClosed ? 'Resolved in ' : 'Open for '}{formatDuration(ticket.createdAt, ticket.resolvedAt)}
                  </span>
                </span>
              </p>
            </div>
          </div>

          {/* IT Staff actions */}
          {isITStaff && !isTicketClosed && (
            <div className="flex space-x-2">
              <button className="btn-secondary px-3 py-1.5 text-sm">
                Assign
              </button>
              <button className="btn-success px-3 py-1.5 text-sm">
                Resolve
              </button>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 alert-danger">
            <div className="flex items-center text-sm text-danger-dark">
              <svg className="mr-2 h-4 w-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-white mt-4 shadow-card border border-border-light">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Initial description */}
            <div className="rounded-lg bg-surface-light p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
                  {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-body-dark">{user?.fullName || 'You'}</p>
                  <p className="text-xs text-text-muted">Original description</p>
                </div>
              </div>
              <p className="text-body-dark whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Conversation messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* System messages (like password reset results) */}
                {message.role === 'system' ? (
                  <div className="w-full">
                    <div className={`rounded-lg p-4 ${
                      message.content.includes('✅')
                        ? 'bg-success/10 border border-success/20'
                        : message.content.includes('❌')
                        ? 'bg-danger/10 border border-danger/20'
                        : 'bg-info/10 border border-info/20'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          message.content.includes('✅')
                            ? 'bg-success/20 text-success'
                            : message.content.includes('❌')
                            ? 'bg-danger/20 text-danger'
                            : 'bg-info/20 text-info'
                        }`}>
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-text-muted mb-2">IT System Notification</p>
                          <div className="whitespace-pre-wrap text-sm text-body-dark">{message.content}</div>
                          <p className="mt-2 text-xs text-text-gray">
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {message.role !== 'user' && (
                      <div className="mr-3 flex-shrink-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-surface-light text-body-dark'
                      }`}
                    >
                      {message.role !== 'user' && (
                        <p className="mb-1 text-xs font-medium text-primary">AI Assistant</p>
                      )}
                      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                      <p
                        className={`mt-2 text-xs ${
                          message.role === 'user' ? 'text-primary-200' : 'text-text-gray'
                        }`}
                      >
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {message.role === 'user' && (
                      <div className="ml-3 flex-shrink-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
                          {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Sending indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="mr-3 flex-shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-light px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm text-text-muted">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Awaiting approval banner */}
          {ticket.status === 'awaiting_approval' && (
            <div className="border-t border-purple/20 bg-purple/10 px-4 py-3">
              <div className="flex items-center justify-center space-x-2 text-purple">
                <svg className="h-5 w-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Awaiting IT Admin Approval</span>
              </div>
              <p className="mt-1 text-center text-sm text-purple-dark">
                Your password reset request is pending. You'll receive your temporary password here once approved.
              </p>
            </div>
          )}

          {/* Input area */}
          {!isTicketClosed ? (
            <div className="border-t border-border-light p-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describe your issue or respond to the AI assistant..."
                  className="input flex-1"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="btn-primary flex items-center space-x-2 px-5 py-3"
                >
                  {sending ? (
                    <span className="spinner h-4 w-4"></span>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  <span>Send</span>
                </button>
              </form>
              <p className="mt-2 text-center text-xs text-text-gray">
                The AI assistant will help troubleshoot your issue or escalate to IT support if needed.
              </p>
            </div>
          ) : (
            <div className="border-t border-border-light bg-success/10 p-4">
              <div className="flex items-center justify-center space-x-2 text-success-dark">
                <svg className="h-5 w-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">This ticket has been {ticket.status}</span>
              </div>
              {ticket.resolution && (
                <p className="mt-2 text-center text-sm text-success">
                  Resolution: {ticket.resolution}
                </p>
              )}
              <div className="mt-3 text-center">
                <Link
                  href="/tickets/new"
                  className="text-sm font-medium text-primary-light hover:text-primary transition-colors"
                >
                  Create a new ticket if you need more help
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
