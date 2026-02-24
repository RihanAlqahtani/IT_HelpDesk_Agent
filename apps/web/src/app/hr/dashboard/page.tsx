'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { hrAPI, EmployeeRecord } from '@/lib/api';
import { DashboardLayout, StatsCard } from '@/components';

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  pendingOnboarding: number;
  offboardedEmployees: number;
  failedOnboarding: number;
  recentOnboardings: EmployeeRecord[];
}

export default function HRDashboardPage() {
  const { user, session } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
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
      const result = await hrAPI.getDashboardStats(session.accessToken);
      setStats(result.data);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'hr' && user?.role !== 'it_admin') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-heading font-bold text-primary-dark">Access Denied</h2>
          <p className="mt-2 text-text-muted">You need HR or IT Admin access to view this page.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-primary-dark">HR Dashboard</h1>
            <p className="mt-1 text-text-muted">Employee onboarding and management overview</p>
          </div>
          <Link
            href="/hr/employees"
            className="btn-primary px-4 py-2 text-sm"
          >
            View All Employees
          </Link>
        </div>

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

        {/* Stats cards */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-surface-light" />
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Employees"
              value={stats.totalEmployees}
              color="blue"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
            />
            <StatsCard
              title="Active"
              value={stats.activeEmployees}
              color="green"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatsCard
              title="Pending"
              value={stats.pendingOnboarding}
              color="yellow"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatsCard
              title="Offboarded"
              value={stats.offboardedEmployees}
              color="purple"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              }
            />
          </div>
        )}

        {/* Failed onboardings alert */}
        {stats && stats.failedOnboarding > 0 && (
          <div className="alert-danger p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-danger mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm text-danger-dark">
                {stats.failedOnboarding} onboarding{stats.failedOnboarding > 1 ? 's' : ''} failed.{' '}
                <Link href="/hr/employees?status=failed" className="underline font-medium">View details</Link>
              </span>
            </div>
          </div>
        )}

        {/* Onboarding form link */}
        <div className="rounded-lg bg-gradient-to-r from-primary to-primary-dark p-6 text-white shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-heading font-semibold">Onboarding Form</h3>
              <p className="mt-1 text-primary-100">
                Share this link with new employees to complete their account setup.
              </p>
              <p className="mt-2 text-sm font-mono text-primary-200 bg-white/10 inline-block px-3 py-1 rounded">
                {typeof window !== 'undefined' ? `${window.location.origin}/onboard` : '/onboard'}
              </p>
            </div>
            <button
              onClick={() => {
                const url = `${window.location.origin}/onboard`;
                navigator.clipboard.writeText(url);
              }}
              className="flex items-center space-x-2 rounded bg-white px-5 py-2.5 text-sm font-medium text-primary-dark shadow-sm transition hover:bg-primary-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>Copy Link</span>
            </button>
          </div>
        </div>

        {/* Recent onboardings */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold text-body-dark">Recent Onboardings</h2>
            <Link
              href="/hr/employees"
              className="text-sm font-medium text-primary-light hover:text-primary transition-colors"
            >
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-light" />
              ))}
            </div>
          ) : stats && stats.recentOnboardings.length > 0 ? (
            <div className="card rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light bg-surface-light">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Corporate Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOnboardings.map((emp) => (
                    <tr key={emp.id} className="border-b border-border-light hover:bg-surface-light transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/hr/employees?id=${emp.id}`} className="font-medium text-primary-dark hover:text-primary">
                          {emp.displayName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted font-mono">{emp.userPrincipalName}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{emp.department || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={emp.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {new Date(emp.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card rounded-lg p-8 text-center">
              <p className="text-text-muted">No onboarding records yet. Share the onboarding form with new employees to get started.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-success/10 text-success-dark',
    pending: 'bg-warning/10 text-warning-dark',
    provisioning: 'bg-info/10 text-info-dark',
    failed: 'bg-danger/10 text-danger-dark',
    offboarded: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
