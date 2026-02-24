'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { ticketsAPI, Ticket } from '@/lib/api';
import { DashboardLayout, TicketTable } from '@/components';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
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

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const { session } = useAuthStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');

  useEffect(() => {
    if (session?.accessToken) {
      loadTickets();
    }
  }, [session?.accessToken, page, statusFilter, categoryFilter]);

  const loadTickets = async () => {
    if (!session?.accessToken) return;

    setLoading(true);
    try {
      const result = await ticketsAPI.list(session.accessToken, {
        page,
        pageSize: 10,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      });

      setTickets(result.tickets);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      setError('Failed to load tickets');
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-primary-dark">My Tickets</h1>
            <p className="mt-1 text-text-muted">View and manage your support requests</p>
          </div>
          <Link
            href="/tickets/new"
            className="btn-primary flex items-center space-x-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>New Ticket</span>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow-card border border-border-light">
          <div className="flex items-center space-x-2">
            <label htmlFor="status" className="text-sm font-medium text-body-dark">
              Status:
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="rounded border border-border-light px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="category" className="text-sm font-medium text-body-dark">
              Category:
            </label>
            <select
              id="category"
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="rounded border border-border-light px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              className="text-sm text-text-muted hover:text-primary transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="alert-danger">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-danger mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-danger-dark">{error}</span>
            </div>
          </div>
        )}

        {/* Tickets list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-light" />
            ))}
          </div>
        ) : (
          <TicketTable
            tickets={tickets}
            emptyMessage={
              statusFilter || categoryFilter
                ? 'No tickets match your filters'
                : "You haven't created any tickets yet. Need help? Create a new ticket!"
            }
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-card border border-border-light">
            <p className="text-sm text-text-muted">
              Page {page} of {totalPages}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
