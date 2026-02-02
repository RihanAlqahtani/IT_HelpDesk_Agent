'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { ticketsAPI, Ticket } from '@/lib/api';
import { DashboardLayout, StatsCard, TicketTable } from '@/components';

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  escalated: number;
  resolved: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export default function DashboardPage() {
  const { user, session } = useAuthStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.accessToken) {
      loadData();
    }
  }, [session?.accessToken]);

  const loadData = async () => {
    if (!session?.accessToken) return;

    try {
      const [ticketsResult, statsResult] = await Promise.all([
        ticketsAPI.list(session.accessToken, { pageSize: 5 }),
        ticketsAPI.getStats(session.accessToken).catch(() => null),
      ]);

      setTickets(ticketsResult.tickets);
      setStats(statsResult);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const isITStaff = user?.role && ['it_support', 'it_admin'].includes(user.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-gray-500">
              {isITStaff
                ? 'Overview of all IT support activity'
                : 'Track your support requests and get help'}
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-100">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Stats cards */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Tickets"
              value={stats?.total || tickets.length}
              color="blue"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
            />
            <StatsCard
              title="Open"
              value={stats?.open || tickets.filter((t) => t.status === 'open').length}
              color="yellow"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatsCard
              title="In Progress"
              value={stats?.inProgress || tickets.filter((t) => t.status === 'in_progress').length}
              color="purple"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <StatsCard
              title="Resolved"
              value={stats?.resolved || tickets.filter((t) => t.status === 'resolved').length}
              color="green"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        )}

        {/* Quick actions for employees */}
        {!isITStaff && (
          <div className="rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Need help with something?</h3>
                <p className="mt-1 text-primary-100">
                  Create a new ticket and our AI assistant will help you resolve your issue quickly.
                </p>
              </div>
              <Link
                href="/tickets/new"
                className="flex items-center space-x-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition hover:bg-primary-50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>New Ticket</span>
              </Link>
            </div>
          </div>
        )}

        {/* IT Staff - Escalated tickets alert */}
        {isITStaff && stats && stats.escalated > 0 && (
          <div className="rounded-xl bg-red-50 p-6 ring-1 ring-red-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="font-semibold text-red-900">
                    {stats.escalated} Escalated {stats.escalated === 1 ? 'Ticket' : 'Tickets'}
                  </h3>
                  <p className="text-sm text-red-700">
                    These tickets require immediate attention from IT staff
                  </p>
                </div>
              </div>
              <Link
                href="/admin/tickets?status=escalated"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                View Escalated
              </Link>
            </div>
          </div>
        )}

        {/* Recent tickets */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isITStaff ? 'Recent Tickets' : 'Your Recent Tickets'}
            </h2>
            <Link
              href={isITStaff ? '/admin/tickets' : '/tickets'}
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : (
            <TicketTable
              tickets={tickets}
              emptyMessage={
                isITStaff
                  ? 'No tickets in the system yet'
                  : "You haven't created any tickets yet. Need help? Create a new ticket!"
              }
            />
          )}
        </div>

        {/* Coming Soon Features - For IT Staff */}
        {isITStaff && (
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Coming Soon</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ComingSoonCard
                title="User Management"
                description="Create, modify, and disable user accounts"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              />
              <ComingSoonCard
                title="Password Resets"
                description="Reset user passwords with approval workflow"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                }
              />
              <ComingSoonCard
                title="Analytics Dashboard"
                description="Track ticket trends and team performance"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ComingSoonCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gray-50 p-6 ring-1 ring-gray-200">
      <div className="absolute right-2 top-2">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Coming Soon
        </span>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 text-gray-500">
        {icon}
      </div>
      <h3 className="mt-4 font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}
