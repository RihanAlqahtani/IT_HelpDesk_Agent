'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { ticketsAPI, Ticket } from '@/lib/api';
import { DashboardLayout, TicketTable, StatsCard } from '@/components';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'login_password', label: 'Login / Password' },
  { value: 'email', label: 'Email' },
  { value: 'network_wifi', label: 'Network / Wi-Fi' },
  { value: 'vpn', label: 'VPN' },
  { value: 'software_installation', label: 'Software Installation' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'security', label: 'Security' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  escalated: number;
  resolved: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, user } = useAuthStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
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
        console.log('Admin page - Fetching fresh profile from server...');
        const response = await fetch('http://localhost:3001/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Admin page - Fresh profile from server:', data.user);

          // Set the verified role from server
          setVerifiedRole(data.user.role);

          // Update store if role has changed
          if (user && data.user.role !== user.role) {
            console.log('Admin page - Role mismatch! Stored:', user.role, 'Server:', data.user.role);
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

  // Debug: log authentication state after profile check
  useEffect(() => {
    if (profileChecked) {
      console.log('Admin page - Auth state after profile check:', {
        hasUser: !!user,
        storedRole: user?.role,
        verifiedRole,
        actualRole,
        isITStaff,
        profileChecked,
      });
    }
  }, [profileChecked, user, verifiedRole, actualRole, isITStaff]);

  useEffect(() => {
    // Wait for profile check to complete before making any decisions
    if (!profileChecked) {
      return;
    }

    if (!user) {
      // Not logged in, redirect to login
      router.push('/login');
      return;
    }

    if (!isITStaff) {
      console.log('Redirecting non-IT user to dashboard. Verified role:', verifiedRole, 'Stored role:', user?.role);
      router.push('/dashboard');
      return;
    }

    if (session?.accessToken) {
      loadData();
    }
  }, [session?.accessToken, page, statusFilter, categoryFilter, isITStaff, router, user, profileChecked, verifiedRole]);

  const loadData = async () => {
    if (!session?.accessToken) return;

    setLoading(true);
    setError('');
    try {
      const [ticketsResult, statsResult] = await Promise.all([
        ticketsAPI.list(session.accessToken, {
          page,
          pageSize: 15,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        }),
        ticketsAPI.getStats(session.accessToken).catch((err) => {
          console.error('Failed to load stats:', err);
          return null;
        }),
      ]);

      setTickets(ticketsResult.tickets);
      setTotalPages(ticketsResult.pagination.totalPages);
      setStats(statsResult);
    } catch (err: any) {
      console.error('Failed to load tickets:', err);
      if (err?.message?.includes('403') || err?.message?.includes('Forbidden')) {
        setError('Access denied. Your role may not have permission to view all tickets. Try logging out and back in.');
      } else {
        setError(`Failed to load tickets: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(1);
  };

  // If user exists but is not IT staff (after profile check), show access denied message
  if (profileChecked && user && !isITStaff) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="rounded-full bg-red-100 p-4">
            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 text-center max-w-md">
            This page is only accessible to IT Support and IT Admin users.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <p className="text-gray-600">Stored role: <span className="font-medium text-gray-900">{user?.role || 'Not set'}</span></p>
            <p className="text-gray-600">Verified role: <span className="font-medium text-gray-900">{verifiedRole || 'Not verified'}</span></p>
            <p className="text-gray-600">Email: <span className="font-medium text-gray-900">{user?.email}</span></p>
          </div>
          <div className="flex space-x-3 mt-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => {
                // Clear local storage and reload to force re-login
                localStorage.removeItem('auth-storage');
                window.location.href = '/login';
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Log Out & Re-Login
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Still loading user or checking profile
  if (!user || !profileChecked) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Tickets</h1>
            <p className="mt-1 text-gray-500">Manage and respond to all support tickets</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-gray-500">Logged in as: <span className="font-medium text-gray-700">{user?.email}</span></p>
            <p className="text-gray-400">Role: <span className="font-medium text-primary-600 capitalize">{user?.role?.replace('_', ' ')}</span></p>
          </div>
        </div>

        {/* Quick stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <QuickStatBadge
              label="Open"
              value={stats.open}
              color="blue"
              active={statusFilter === 'open'}
              onClick={() => handleStatusChange(statusFilter === 'open' ? '' : 'open')}
            />
            <QuickStatBadge
              label="In Progress"
              value={stats.inProgress}
              color="amber"
              active={statusFilter === 'in_progress'}
              onClick={() => handleStatusChange(statusFilter === 'in_progress' ? '' : 'in_progress')}
            />
            <QuickStatBadge
              label="Escalated"
              value={stats.escalated}
              color="red"
              active={statusFilter === 'escalated'}
              onClick={() => handleStatusChange(statusFilter === 'escalated' ? '' : 'escalated')}
            />
            <QuickStatBadge
              label="Resolved"
              value={stats.resolved}
              color="green"
              active={statusFilter === 'resolved'}
              onClick={() => handleStatusChange(statusFilter === 'resolved' ? '' : 'resolved')}
            />
            <QuickStatBadge
              label="Total"
              value={stats.total}
              color="gray"
              active={!statusFilter}
              onClick={() => handleStatusChange('')}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center space-x-2">
            <label htmlFor="status" className="text-sm font-medium text-gray-700">
              Status:
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="category" className="text-sm font-medium text-gray-700">
              Category:
            </label>
            <select
              id="category"
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {(statusFilter || categoryFilter) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setCategoryFilter('');
                setPage(1);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto">
            <button
              onClick={loadData}
              className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
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

        {/* Tickets list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <TicketTable
            tickets={tickets}
            showUser={true}
            isAdminView={true}
            emptyMessage={
              statusFilter || categoryFilter
                ? 'No tickets match your filters'
                : 'No tickets in the system yet'
            }
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function QuickStatBadge({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: 'blue' | 'amber' | 'red' | 'green' | 'gray';
  active: boolean;
  onClick: () => void;
}) {
  const colorClasses = {
    blue: active ? 'bg-blue-100 ring-blue-500 text-blue-800' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    amber: active ? 'bg-amber-100 ring-amber-500 text-amber-800' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    red: active ? 'bg-red-100 ring-red-500 text-red-800' : 'bg-red-50 text-red-700 hover:bg-red-100',
    green: active ? 'bg-green-100 ring-green-500 text-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100',
    gray: active ? 'bg-gray-100 ring-gray-500 text-gray-800' : 'bg-gray-50 text-gray-700 hover:bg-gray-100',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg px-4 py-3 transition ${colorClasses[color]} ${active ? 'ring-2' : ''}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </button>
  );
}
