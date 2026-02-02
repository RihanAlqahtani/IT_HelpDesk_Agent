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

  const loadTicketData = async () => {
    if (!session?.accessToken) return;

    try {
      const [ticketData, historyData] = await Promise.all([
        ticketsAPI.get(session.accessToken, ticketId),
        agentAPI.getHistory(session.accessToken, ticketId),
      ]);

      setTicket(ticketData);
      setMessages(historyData.messages);
    } catch (err) {
      setError('Failed to load ticket');
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

      // Replace temp message and add agent response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== 'temp-user');
        return [
          ...filtered,
          { ...tempUserMessage, id: `user-${Date.now()}` },
          {
            id: result.conversationId,
            ticketId,
            role: 'agent',
            content: buildAgentContent(result.response),
            agentResponse: result.response,
            createdAt: new Date().toISOString(),
          },
        ];
      });

      // Refresh ticket if updated
      if (result.ticketUpdated) {
        const updatedTicket = await ticketsAPI.get(session.accessToken, ticketId);
        setTicket(updatedTicket);
      }
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

    return parts.join('\n') || 'How can I help you further with this issue?';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800 ring-blue-600/20';
      case 'in_progress':
        return 'bg-amber-100 text-amber-800 ring-amber-600/20';
      case 'awaiting_approval':
        return 'bg-purple-100 text-purple-800 ring-purple-600/20';
      case 'escalated':
        return 'bg-red-100 text-red-800 ring-red-600/20';
      case 'resolved':
        return 'bg-green-100 text-green-800 ring-green-600/20';
      case 'closed':
        return 'bg-gray-100 text-gray-800 ring-gray-600/20';
      default:
        return 'bg-gray-100 text-gray-800 ring-gray-600/20';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-amber-600 bg-amber-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
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
            <p className="text-sm text-gray-500">Loading ticket...</p>
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
              className="mx-auto h-12 w-12 text-gray-400"
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
            <p className="mt-4 text-gray-500">Ticket not found</p>
            <Link href="/dashboard" className="mt-4 inline-block text-primary-600 hover:text-primary-700">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-130px)] flex-col">
        {/* Ticket header */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
          <div className="flex items-start space-x-4">
            <Link
              href="/dashboard"
              className="mt-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-bold text-gray-900">Ticket #{ticket.ticketNumber}</h1>
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
              <p className="mt-1 text-gray-600">{ticket.subject}</p>
              <p className="mt-1 text-sm text-gray-400 flex items-center space-x-2">
                <span>{formatCategory(ticket.category)}</span>
                <span>&bull;</span>
                <span>Created {new Date(ticket.createdAt).toLocaleDateString()}</span>
                <span>&bull;</span>
                <span className="flex items-center">
                  {isTicketClosed ? (
                    <svg className="h-3.5 w-3.5 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-gray-400 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className={isTicketClosed ? 'text-green-600' : ''}>
                    {isTicketClosed ? 'Resolved in ' : 'Open for '}{formatDuration(ticket.createdAt, ticket.resolvedAt)}
                  </span>
                </span>
              </p>
            </div>
          </div>

          {/* IT Staff actions */}
          {isITStaff && !isTicketClosed && (
            <div className="flex space-x-2">
              <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                Assign
              </button>
              <button className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                Resolve
              </button>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-100">
            <div className="flex items-center text-sm text-red-700">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-white mt-4 shadow-sm ring-1 ring-gray-100">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Initial description */}
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
                  {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{user?.fullName || 'You'}</p>
                  <p className="text-xs text-gray-500">Original description</p>
                </div>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Conversation messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role !== 'user' && (
                  <div className="mr-3 flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                )}

                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {message.role !== 'user' && (
                    <p className="mb-1 text-xs font-medium text-primary-600">AI Assistant</p>
                  )}
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  <p
                    className={`mt-2 text-xs ${
                      message.role === 'user' ? 'text-primary-200' : 'text-gray-400'
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {message.role === 'user' && (
                  <div className="ml-3 flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-100 px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm text-gray-500">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {!isTicketClosed ? (
            <div className="border-t border-gray-100 p-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describe your issue or respond to the AI assistant..."
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="flex items-center space-x-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="mt-2 text-center text-xs text-gray-400">
                The AI assistant will help troubleshoot your issue or escalate to IT support if needed.
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-100 bg-green-50 p-4">
              <div className="flex items-center justify-center space-x-2 text-green-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">This ticket has been {ticket.status}</span>
              </div>
              {ticket.resolution && (
                <p className="mt-2 text-center text-sm text-green-600">
                  Resolution: {ticket.resolution}
                </p>
              )}
              <div className="mt-3 text-center">
                <Link
                  href="/tickets/new"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
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
