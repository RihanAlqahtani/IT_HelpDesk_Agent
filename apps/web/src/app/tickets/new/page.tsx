'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { agentAPI, ticketsAPI, Ticket, AgentResponse, APIError, ConversationMessage } from '@/lib/api';
import { DashboardLayout } from '@/components';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export default function NewTicketPage() {
  const router = useRouter();
  const { session, user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Polling for updates when ticket is awaiting approval (to get temp password after admin approves)
  const [shouldPoll, setShouldPoll] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  // Determine if we should be polling based on ticket status
  useEffect(() => {
    if (!ticket) return;

    // Start polling when ticket enters awaiting_approval
    if (ticket.status === 'awaiting_approval') {
      setShouldPoll(true);
    }

    // When status changes from awaiting_approval, do a final fetch for the password message
    if (prevStatusRef.current === 'awaiting_approval' && ticket.status !== 'awaiting_approval') {
      const fetchFinalMessages = async () => {
        if (!session?.accessToken || !ticket) return;
        try {
          const historyData = await agentAPI.getHistory(session.accessToken, ticket.id);
          // Check for system messages (password results)
          const systemMessages = historyData.messages.filter(
            (m: ConversationMessage) => m.role === 'system'
          );
          if (systemMessages.length > 0) {
            // Add system messages to our local messages
            const newMessages: Message[] = systemMessages.map((m: ConversationMessage) => ({
              id: m.id,
              role: 'agent' as const, // Display as agent message
              content: m.content,
              timestamp: new Date(m.createdAt),
            }));
            setMessages((prev) => [...prev, ...newMessages]);
          }
        } catch (err) {
          console.error('Final fetch error:', err);
        }
        setShouldPoll(false);
      };
      fetchFinalMessages();
    }

    prevStatusRef.current = ticket.status;
  }, [ticket?.status, session?.accessToken]);

  // Active polling when awaiting approval
  useEffect(() => {
    if (!session?.accessToken || !ticket || !shouldPoll) return;

    const pollInterval = setInterval(async () => {
      try {
        // Fetch latest ticket status and messages
        const [ticketData, historyData] = await Promise.all([
          ticketsAPI.get(session.accessToken, ticket.id),
          agentAPI.getHistory(session.accessToken, ticket.id),
        ]);

        // Update ticket if status changed
        if (ticketData.status !== ticket.status) {
          setTicket(ticketData);
        }

        // Check for new system messages (password results)
        const systemMessages = historyData.messages.filter(
          (m: ConversationMessage) => m.role === 'system'
        );
        const existingSystemIds = messages
          .filter((m) => m.id.startsWith('system-') || historyData.messages.some((hm: ConversationMessage) => hm.id === m.id && hm.role === 'system'))
          .map((m) => m.id);

        const newSystemMessages = systemMessages.filter(
          (m: ConversationMessage) => !existingSystemIds.includes(m.id)
        );

        if (newSystemMessages.length > 0) {
          const newMessages: Message[] = newSystemMessages.map((m: ConversationMessage) => ({
            id: m.id,
            role: 'agent' as const,
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
          setMessages((prev) => [...prev, ...newMessages]);

          // Stop polling if we got a password message
          const hasPasswordMessage = newSystemMessages.some(
            (m: ConversationMessage) => m.content.includes('temporary password')
          );
          if (hasPasswordMessage) {
            setShouldPoll(false);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [session?.accessToken, ticket?.id, ticket?.status, shouldPoll, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || !session?.accessToken) return;

    const messageContent = inputValue.trim();
    setInputValue('');
    setError('');
    setSending(true);

    // Add user message to chat
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      if (!ticket) {
        // First message - create ticket via AI classification
        const result = await agentAPI.startConversation(session.accessToken, messageContent);

        setTicket(result.ticket);

        // Add AI response
        const agentMessage: Message = {
          id: result.conversationId,
          role: 'agent',
          content: buildAgentContent(result.response),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, agentMessage]);
      } else {
        // Subsequent messages - continue conversation
        const result = await agentAPI.chat(session.accessToken, ticket.id, messageContent);

        // Use the saved agent message content directly from API response
        // This ensures consistent display and avoids buildAgentContent missing handlers
        const agentMessage: Message = {
          id: result.conversationId,
          role: 'agent',
          content: result.agentMessage.content,
          timestamp: new Date(result.agentMessage.createdAt),
        };
        setMessages((prev) => [...prev, agentMessage]);

        // Update ticket state if it was changed
        if (result.ticketUpdated && result.response.decision === 'escalate') {
          setTicket((prev) => prev ? { ...prev, status: 'escalated' } : null);
        } else if (result.ticketUpdated && result.response.decision === 'resolve') {
          setTicket((prev) => prev ? { ...prev, status: 'resolved' } : null);
        } else if (result.ticketUpdated && result.response.decision === 'request_approval') {
          setTicket((prev) => prev ? { ...prev, status: 'awaiting_approval' } : null);
        }
      }
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message);
      } else {
        setError('Failed to send message. Please try again.');
      }
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInputValue(messageContent);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const buildAgentContent = (response: AgentResponse): string => {
    const parts: string[] = [];

    if (response.clarifying_questions && response.clarifying_questions.length > 0) {
      parts.push("I have a few questions to better understand your issue:");
      response.clarifying_questions.forEach((q, i) => {
        parts.push(`${i + 1}. ${q}`);
      });
    }

    if (response.troubleshooting_steps && response.troubleshooting_steps.length > 0) {
      if (parts.length > 0) parts.push('');
      parts.push("Let's try these steps:");
      response.troubleshooting_steps.forEach((step) => {
        parts.push(`\n**Step ${step.step_number}:** ${step.instruction}`);
        parts.push(`_Expected: ${step.expected_outcome}_`);
      });
      parts.push('\nPlease let me know the results after trying these steps.');
    }

    if (response.decision === 'escalate' && response.escalation_summary) {
      if (parts.length > 0) parts.push('');
      parts.push(`I'm escalating this to our IT support team for immediate attention.`);
      parts.push(`**Reason:** ${response.escalation_summary.reason}`);
      parts.push('\nA support specialist will follow up with you shortly.');
    }

    if (response.decision === 'resolve') {
      if (parts.length > 0) parts.push('');
      parts.push("It looks like your issue has been resolved. I'm marking this ticket as complete.");
      parts.push('\nIf you have any other issues, feel free to start a new conversation.');
    }

    // Handle password reset / privileged action approval requests
    if (response.decision === 'request_approval') {
      if (parts.length > 0) parts.push('');
      parts.push("🔐 **Password Reset Request Submitted**");
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

    return parts.join('\n') || 'How can I help you with this issue?';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-info/10 text-info-dark';
      case 'in_progress': return 'bg-warning/10 text-warning-dark';
      case 'escalated': return 'bg-danger/10 text-danger-dark';
      case 'resolved': return 'bg-success/10 text-success-dark';
      default: return 'bg-surface-light text-body-dark';
    }
  };

  const formatCategory = (category: string) => {
    return category.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as unknown as React.FormEvent);
    }
  };

  const isTicketClosed = ticket?.status === 'resolved' || ticket?.status === 'closed' || ticket?.status === 'escalated';

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-130px)] flex-col">
        {/* Header */}
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
              {ticket ? (
                <>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-xl font-heading font-bold text-primary-dark">Ticket #{ticket.ticketNumber}</h1>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    {formatCategory(ticket.category)} &bull; {ticket.severity} severity
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-heading font-bold text-primary-dark">Get IT Help</h1>
                  <p className="mt-1 text-text-muted">
                    Describe your issue and I'll help you troubleshoot
                  </p>
                </>
              )}
            </div>
          </div>
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
            {/* Welcome message if no messages yet */}
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
                  <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-heading font-semibold text-body-dark">How can I help you today?</h3>
                <p className="mt-2 text-text-muted max-w-md mx-auto">
                  Describe your IT issue in your own words. I'll analyze the problem, ask any clarifying questions, and guide you through troubleshooting steps.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    "I can't log into my account",
                    "My email isn't working",
                    "Wi-Fi keeps disconnecting",
                    "Need help installing software",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInputValue(suggestion)}
                      className="rounded-full bg-primary-50 px-4 py-2 text-sm text-primary hover:bg-primary-100 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
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
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {message.role === 'user' && (
                  <div className="ml-3 flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
                      {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                    </div>
                  </div>
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
                    <span className="text-sm text-text-muted">
                      {ticket ? 'AI is thinking...' : 'Creating ticket and analyzing...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {!isTicketClosed ? (
            <div className="border-t border-border-light p-4">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-4">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ticket ? "Describe what happened after trying the steps..." : "Describe your IT issue..."}
                  className="input flex-1 resize-none"
                  disabled={sending}
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                <button
                  type="submit"
                  disabled={sending || !inputValue.trim()}
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
                {ticket
                  ? "Continue the conversation or describe any new issues"
                  : "The AI will classify your issue and guide you through troubleshooting"
                }
              </p>
            </div>
          ) : (
            <div className="border-t border-border-light bg-surface-light p-4">
              <div className="flex items-center justify-center space-x-2 text-body-dark">
                {ticket?.status === 'escalated' ? (
                  <>
                    <svg className="h-5 w-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">This issue has been escalated to IT support</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">This ticket has been resolved</span>
                  </>
                )}
              </div>
              <div className="mt-3 text-center">
                <Link
                  href={`/tickets/${ticket?.id}`}
                  className="text-sm font-medium text-primary-light hover:text-primary mr-4 transition-colors"
                >
                  View ticket details
                </Link>
                <button
                  onClick={() => {
                    setMessages([]);
                    setTicket(null);
                    setInputValue('');
                    setError('');
                  }}
                  className="text-sm font-medium text-text-muted hover:text-body-dark transition-colors"
                >
                  Start new conversation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
