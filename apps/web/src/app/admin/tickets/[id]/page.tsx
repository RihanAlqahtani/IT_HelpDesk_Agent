'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { ticketsAPI, agentAPI, Ticket, ConversationMessage } from '@/lib/api';
import { DashboardLayout } from '@/components';

interface TicketUser {
  id: string;
  email: string;
  fullName: string;
  department?: string;
}

export default function AdminTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const { session, user } = useAuthStore();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketUser, setTicketUser] = useState<TicketUser | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [verifiedRole, setVerifiedRole] = useState<string | null>(null);

  // Check if user is IT staff - use verified role if available
  const actualRole = verifiedRole || user?.role;
  const isITStaff = actualRole && ['it_support', 'it_admin'].includes(actualRole);

  // Refresh user profile from server to get the latest role (runs once on mount)
  useEffect(() => {
    const refreshProfile = async () => {
      if (!session?.accessToken) {
        setProfileChecked(true);
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setVerifiedRole(data.user.role);

          // Update store if role has changed
          if (user && data.user.role !== user.role) {
            useAuthStore.getState().setUser({
              ...user,
              role: data.user.role,
              permissions: data.user.permissions || [],
            });
          }
        }
      } catch (err) {
        console.error('Failed to refresh profile:', err);
      } finally {
        setProfileChecked(true);
      }
    };

    refreshProfile();
  }, [session?.accessToken]);

  useEffect(() => {
    // Wait for profile check to complete
    if (!profileChecked) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (!isITStaff) {
      router.push('/dashboard');
      return;
    }

    if (session?.accessToken) {
      loadData();
    }
  }, [session?.accessToken, ticketId, isITStaff, router, profileChecked, user]);

  const loadData = async () => {
    if (!session?.accessToken) return;

    try {
      // Load ticket details first - this is required
      const detailsResult = await ticketsAPI.getDetails(session.accessToken, ticketId);
      setTicket(detailsResult.ticket);
      setTicketUser(detailsResult.user);

      // Load conversation history separately - don't let it block ticket display
      try {
        const historyResult = await agentAPI.getHistory(session.accessToken, ticketId);
        setMessages(historyResult.messages);
      } catch (historyErr) {
        console.error('Failed to load conversation history:', historyErr);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load ticket details:', err);
      setError('Failed to load ticket details. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!session?.accessToken || !resolution.trim()) return;

    setResolving(true);
    try {
      const updatedTicket = await ticketsAPI.resolve(session.accessToken, ticketId, resolution);
      setTicket(updatedTicket);
      setShowResolveModal(false);
      setResolution('');
    } catch (err) {
      setError('Failed to resolve ticket');
    } finally {
      setResolving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800 ring-blue-600/20';
      case 'in_progress': return 'bg-amber-100 text-amber-800 ring-amber-600/20';
      case 'escalated': return 'bg-red-100 text-red-800 ring-red-600/20';
      case 'resolved': return 'bg-green-100 text-green-800 ring-green-600/20';
      case 'closed': return 'bg-gray-100 text-gray-800 ring-gray-600/20';
      default: return 'bg-gray-100 text-gray-800 ring-gray-600/20';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 ring-red-600/20';
      case 'medium': return 'text-amber-600 bg-amber-50 ring-amber-600/20';
      case 'low': return 'text-green-600 bg-green-50 ring-green-600/20';
      default: return 'text-gray-600 bg-gray-50 ring-gray-600/20';
    }
  };

  const formatCategory = (category: string) => {
    return category.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Calculate duration between two dates
  const calculateDuration = (startDate: string, endDate?: string | null): string => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffMs = end.getTime() - start.getTime();

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return '< 1 minute';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      const mins = diffMinutes % 60;
      return mins > 0 ? `${diffHours}h ${mins}m` : `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else {
      const hours = diffHours % 24;
      return hours > 0 ? `${diffDays}d ${hours}h` : `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
  };

  // Get all duration metrics for the ticket
  const getDurationMetrics = () => {
    if (!ticket) return null;

    const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
    const isEscalated = ticket.status === 'escalated' || !!ticket.escalatedAt;

    return {
      // Time from creation to now (running time)
      totalOpenTime: calculateDuration(ticket.createdAt),
      // Time from creation to escalation
      timeToEscalation: ticket.escalatedAt ? calculateDuration(ticket.createdAt, ticket.escalatedAt) : null,
      // Time from creation to resolution
      timeToResolution: ticket.resolvedAt ? calculateDuration(ticket.createdAt, ticket.resolvedAt) : null,
      // Time since escalation (if still escalated)
      timeSinceEscalation: ticket.escalatedAt && !isResolved ? calculateDuration(ticket.escalatedAt) : null,
      isResolved,
      isEscalated,
    };
  };

  const formatDuration = (createdAt: string, resolvedAt?: string) => {
    return calculateDuration(createdAt, resolvedAt);
  };

  // Wait for profile check before showing anything
  if (!profileChecked || !user) {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <div className="spinner mx-auto mb-4 h-8 w-8"></div>
            <p className="text-sm text-gray-500">
              {!profileChecked ? 'Verifying permissions...' : 'Loading...'}
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isITStaff) return null;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <div className="spinner mx-auto mb-4 h-8 w-8"></div>
            <p className="text-sm text-gray-500">Loading ticket details...</p>
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
            <p className="text-gray-500">Ticket not found</p>
            <Link href="/admin/tickets" className="mt-4 inline-block text-primary-600 hover:text-primary-700">
              Back to Tickets
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isTicketClosed = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <Link
              href="/admin/tickets"
              className="mt-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">Ticket #{ticket.ticketNumber}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusColor(ticket.status)}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getSeverityColor(ticket.severity)}`}>
                  {ticket.severity}
                </span>
              </div>
              <p className="mt-1 text-lg text-gray-700">{ticket.subject}</p>
            </div>
          </div>

          {!isTicketClosed && (
            <div className="flex space-x-2">
              <button
                onClick={() => setShowResolveModal(true)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Resolve Ticket
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-100">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Description */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Issue Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Escalation Info */}
            {ticket.status === 'escalated' && ticket.escalationReason && (
              <div className="rounded-xl bg-red-50 p-6 shadow-sm ring-1 ring-red-100">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-red-800">Escalation Reason</h3>
                    <p className="mt-2 text-red-700">{ticket.escalationReason}</p>
                    {ticket.escalatedAt && (
                      <p className="mt-2 text-sm text-red-600">
                        Escalated on {new Date(ticket.escalatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Resolution Info */}
            {ticket.resolution && (
              <div className="rounded-xl bg-green-50 p-6 shadow-sm ring-1 ring-green-100">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Resolution</h3>
                    <p className="mt-2 text-green-700">{ticket.resolution}</p>
                    {ticket.resolvedAt && (
                      <p className="mt-2 text-sm text-green-600">
                        Resolved on {new Date(ticket.resolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation History */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                AI Conversation History
                <span className="ml-2 text-sm font-normal text-gray-500">({messages.length} messages)</span>
              </h2>

              {messages.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No conversation history yet</p>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg p-4 ${
                        message.role === 'user' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-medium ${
                          message.role === 'user' ? 'text-blue-600' : 'text-gray-600'
                        }`}>
                          {message.role === 'user' ? 'Employee' : 'AI Assistant'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(message.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Right column */}
          <div className="space-y-6">
            {/* Employee Info */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Employee Information</h2>
              {ticketUser ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
                      {ticketUser.fullName.split(' ').map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{ticketUser.fullName}</p>
                      <p className="text-sm text-gray-500">{ticketUser.email}</p>
                    </div>
                  </div>
                  {ticketUser.department && (
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-sm text-gray-500">Department</p>
                      <p className="font-medium text-gray-900">{ticketUser.department}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">User information not available</p>
              )}
            </div>

            {/* Ticket Details */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ticket Details</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Category</span>
                  <span className="font-medium text-gray-900">{formatCategory(ticket.category)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Severity</span>
                  <span className={`font-medium capitalize ${
                    ticket.severity === 'high' ? 'text-red-600' :
                    ticket.severity === 'medium' ? 'text-amber-600' : 'text-green-600'
                  }`}>{ticket.severity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Ticket Timeline */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                <div className="space-y-6">
                  {/* Created */}
                  <div className="relative flex items-start pl-10">
                    <div className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                      <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">Ticket Created</p>
                      <p className="text-xs text-gray-500">{new Date(ticket.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Escalated (if applicable) */}
                  {ticket.escalatedAt && (
                    <div className="relative flex items-start pl-10">
                      <div className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full bg-red-100 ring-4 ring-white">
                        <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-700">Escalated to IT Staff</p>
                        <p className="text-xs text-gray-500">{new Date(ticket.escalatedAt).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-red-600">
                          After {getDurationMetrics()?.timeToEscalation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Resolved (if applicable) */}
                  {ticket.resolvedAt && (
                    <div className="relative flex items-start pl-10">
                      <div className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full bg-green-100 ring-4 ring-white">
                        <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-700">Ticket Resolved</p>
                        <p className="text-xs text-gray-500">{new Date(ticket.resolvedAt).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-green-600">
                          Total time: {getDurationMetrics()?.timeToResolution}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Current status indicator (if not resolved) */}
                  {!ticket.resolvedAt && ticket.status !== 'closed' && (
                    <div className="relative flex items-start pl-10">
                      <div className={`absolute left-0 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white ${
                        ticket.status === 'escalated' ? 'bg-red-100' : 'bg-amber-100'
                      }`}>
                        <div className={`h-3 w-3 rounded-full animate-pulse ${
                          ticket.status === 'escalated' ? 'bg-red-500' : 'bg-amber-500'
                        }`}></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          ticket.status === 'escalated' ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          {ticket.status === 'escalated' ? 'Awaiting IT Response' : 'In Progress'}
                        </p>
                        <p className="text-xs text-gray-500">Currently active</p>
                        <p className={`mt-1 text-xs ${
                          ticket.status === 'escalated' ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          Open for {getDurationMetrics()?.totalOpenTime}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Duration Metrics */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Duration Metrics</h2>
              <div className="space-y-4">
                {/* Time to Escalation */}
                {ticket.escalatedAt && (
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-red-700">Time to Escalation</span>
                    </div>
                    <span className="font-semibold text-red-700">{getDurationMetrics()?.timeToEscalation}</span>
                  </div>
                )}

                {/* Time Since Escalation (if still escalated) */}
                {getDurationMetrics()?.timeSinceEscalation && (
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="h-5 w-5 text-orange-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-orange-700">Waiting Since Escalation</span>
                    </div>
                    <span className="font-semibold text-orange-700">{getDurationMetrics()?.timeSinceEscalation}</span>
                  </div>
                )}

                {/* Time to Resolution (if resolved) */}
                {ticket.resolvedAt ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-700">Total Resolution Time</span>
                    </div>
                    <span className="font-semibold text-green-700">{getDurationMetrics()?.timeToResolution}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-amber-700">Total Time Open</span>
                    </div>
                    <span className="font-semibold text-amber-700">{getDurationMetrics()?.totalOpenTime}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats from Conversation */}
            {messages.length > 0 && (
              <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Interaction Summary</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">
                      {messages.filter((m) => m.role === 'user').length}
                    </p>
                    <p className="text-xs text-gray-500">User Messages</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">
                      {messages.filter((m) => m.role === 'agent').length}
                    </p>
                    <p className="text-xs text-gray-500">AI Responses</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resolve Modal */}
        {showResolveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolve Ticket</h3>
              <p className="text-sm text-gray-500 mb-4">
                Provide a resolution description for this ticket. This will be visible to the employee.
              </p>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe how the issue was resolved..."
                className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                rows={4}
              />
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setShowResolveModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolve}
                  disabled={resolving || !resolution.trim()}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {resolving ? 'Resolving...' : 'Resolve Ticket'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
