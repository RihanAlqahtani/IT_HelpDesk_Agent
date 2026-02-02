'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { agentAPI, Ticket, AgentResponse, APIError } from '@/lib/api';
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

        // Add AI response
        const agentMessage: Message = {
          id: result.conversationId,
          role: 'agent',
          content: buildAgentContent(result.response),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, agentMessage]);

        // Update ticket state if it was changed
        if (result.ticketUpdated && result.response.decision === 'escalate') {
          setTicket((prev) => prev ? { ...prev, status: 'escalated' } : null);
        } else if (result.ticketUpdated && result.response.decision === 'resolve') {
          setTicket((prev) => prev ? { ...prev, status: 'resolved' } : null);
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

    return parts.join('\n') || 'How can I help you with this issue?';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-amber-100 text-amber-800';
      case 'escalated': return 'bg-red-100 text-red-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
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
              {ticket ? (
                <>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-xl font-bold text-gray-900">Ticket #{ticket.ticketNumber}</h1>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatCategory(ticket.category)} &bull; {ticket.severity} severity
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-gray-900">Get IT Help</h1>
                  <p className="mt-1 text-gray-500">
                    Describe your issue and I'll help you troubleshoot
                  </p>
                </>
              )}
            </div>
          </div>
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
            {/* Welcome message if no messages yet */}
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
                  <svg className="h-8 w-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">How can I help you today?</h3>
                <p className="mt-2 text-gray-500 max-w-md mx-auto">
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
                      className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 transition"
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
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                    <span className="text-sm text-gray-500">
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
            <div className="border-t border-gray-100 p-4">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-4">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ticket ? "Describe what happened after trying the steps..." : "Describe your IT issue..."}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  disabled={sending}
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                <button
                  type="submit"
                  disabled={sending || !inputValue.trim()}
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
                {ticket
                  ? "Continue the conversation or describe any new issues"
                  : "The AI will classify your issue and guide you through troubleshooting"
                }
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-center space-x-2 text-gray-700">
                {ticket?.status === 'escalated' ? (
                  <>
                    <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">This issue has been escalated to IT support</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">This ticket has been resolved</span>
                  </>
                )}
              </div>
              <div className="mt-3 text-center">
                <Link
                  href={`/tickets/${ticket?.id}`}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 mr-4"
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
                  className="text-sm font-medium text-gray-600 hover:text-gray-700"
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
