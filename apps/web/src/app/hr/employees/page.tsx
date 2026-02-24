'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { hrAPI, EmployeeRecord } from '@/lib/api';
import { DashboardLayout } from '@/components';

export default function HREmployeesPage() {
  const { user, session } = useAuthStore();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '';
  const selectedId = searchParams.get('id') || '';

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

  // Modify form state
  const [editMode, setEditMode] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');

  // Offboard state
  const [showOffboardModal, setShowOffboardModal] = useState(false);
  const [offboardReason, setOffboardReason] = useState('');

  const loadEmployees = useCallback(async () => {
    if (!session?.accessToken) return;
    try {
      const result = await hrAPI.getEmployees(session.accessToken, {
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      });
      setEmployees(result.data || []);

      // Auto-select employee if ID in URL
      if (selectedId && result.data) {
        const emp = result.data.find((e: EmployeeRecord) => e.id === selectedId);
        if (emp) setSelectedEmployee(emp);
      }
    } catch (err) {
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, statusFilter, searchQuery, selectedId]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const handleModify = async () => {
    if (!session?.accessToken || !selectedEmployee) return;
    setActionLoading('modify');
    setActionMessage({ type: '', text: '' });

    try {
      await hrAPI.modifyEmployee(session.accessToken, selectedEmployee.id, {
        jobTitle: editJobTitle,
        department: editDepartment,
      });
      setActionMessage({ type: 'success', text: 'Employee updated successfully' });
      setEditMode(false);
      await loadEmployees();
      // Update selected employee
      setSelectedEmployee((prev) =>
        prev
          ? { ...prev, jobTitle: editJobTitle || null, department: editDepartment || null }
          : null
      );
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to update employee' });
    } finally {
      setActionLoading('');
    }
  };

  const handleOffboard = async () => {
    if (!session?.accessToken || !selectedEmployee || !offboardReason) return;
    setActionLoading('offboard');
    setActionMessage({ type: '', text: '' });

    try {
      await hrAPI.offboardEmployee(session.accessToken, selectedEmployee.id, offboardReason);
      setActionMessage({ type: 'success', text: 'Employee offboarded successfully' });
      setShowOffboardModal(false);
      setOffboardReason('');
      await loadEmployees();
      setSelectedEmployee((prev) => (prev ? { ...prev, status: 'offboarded' } : null));
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to offboard employee' });
    } finally {
      setActionLoading('');
    }
  };

  const handleResendCredentials = async () => {
    if (!session?.accessToken || !selectedEmployee) return;
    setActionLoading('resend');
    setActionMessage({ type: '', text: '' });

    try {
      await hrAPI.resendCredentials(session.accessToken, selectedEmployee.id);
      setActionMessage({ type: 'success', text: 'Credentials resent successfully' });
      await loadEmployees();
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to resend credentials' });
    } finally {
      setActionLoading('');
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
        <div>
          <h1 className="text-2xl font-heading font-bold text-primary-dark">Employees</h1>
          <p className="mt-1 text-text-muted">Manage onboarded employees</p>
        </div>

        {error && (
          <div className="alert-danger">
            <span className="text-sm text-danger-dark">{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-48"
          >
            <option value="">All Statuses</option>
            <option value="completed">Active</option>
            <option value="pending">Pending</option>
            <option value="provisioning">Provisioning</option>
            <option value="failed">Failed</option>
            <option value="offboarded">Offboarded</option>
          </select>
        </div>

        <div className="flex gap-6">
          {/* Employee list */}
          <div className={`${selectedEmployee ? 'w-1/2' : 'w-full'} transition-all`}>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-light" />
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="card rounded-lg p-8 text-center">
                <p className="text-text-muted">No employees found.</p>
              </div>
            ) : (
              <div className="card rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-light bg-surface-light">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setEditMode(false);
                          setActionMessage({ type: '', text: '' });
                        }}
                        className={`border-b border-border-light cursor-pointer transition-colors ${
                          selectedEmployee?.id === emp.id
                            ? 'bg-primary/5'
                            : 'hover:bg-surface-light'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-body-dark">{emp.displayName}</div>
                          <div className="text-xs text-text-muted">{emp.department || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">{emp.userPrincipalName}</td>
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
            )}
          </div>

          {/* Employee detail panel */}
          {selectedEmployee && (
            <div className="w-1/2">
              <div className="card rounded-lg p-6 sticky top-20">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-heading font-bold text-primary-dark">
                      {selectedEmployee.displayName}
                    </h2>
                    <p className="text-sm font-mono text-text-muted">{selectedEmployee.userPrincipalName}</p>
                  </div>
                  <button
                    onClick={() => setSelectedEmployee(null)}
                    className="text-text-muted hover:text-body-dark transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Action messages */}
                {actionMessage.text && (
                  <div className={`mb-4 p-3 rounded-lg text-sm ${
                    actionMessage.type === 'success'
                      ? 'bg-success/10 text-success-dark'
                      : 'bg-danger/10 text-danger-dark'
                  }`}>
                    {actionMessage.text}
                  </div>
                )}

                {/* Status */}
                <div className="mb-4">
                  <StatusBadge status={selectedEmployee.status} />
                </div>

                {/* Details */}
                <div className="space-y-3 mb-6">
                  <DetailRow label="Personal Email" value={selectedEmployee.personalEmail} />
                  <DetailRow label="Job Title" value={selectedEmployee.jobTitle || '-'} />
                  <DetailRow label="Department" value={selectedEmployee.department || '-'} />
                  <DetailRow label="License" value={selectedEmployee.licenseAssigned || 'Not assigned'} />
                  <DetailRow
                    label="Credentials Emailed"
                    value={
                      selectedEmployee.credentialsEmailed
                        ? `Yes (${selectedEmployee.credentialsEmailedAt ? new Date(selectedEmployee.credentialsEmailedAt).toLocaleString() : ''})`
                        : 'No'
                    }
                  />
                  <DetailRow label="Onboarded" value={new Date(selectedEmployee.createdAt).toLocaleString()} />
                  {selectedEmployee.offboardedAt && (
                    <DetailRow label="Offboarded" value={new Date(selectedEmployee.offboardedAt).toLocaleString()} />
                  )}
                  {selectedEmployee.offboardReason && (
                    <DetailRow label="Offboard Reason" value={selectedEmployee.offboardReason} />
                  )}
                  {selectedEmployee.errorMessage && (
                    <div className="bg-danger/5 border border-danger/20 rounded p-3 text-sm text-danger-dark">
                      <strong>Error:</strong> {selectedEmployee.errorMessage}
                    </div>
                  )}
                </div>

                {/* Edit mode */}
                {editMode && selectedEmployee.status !== 'offboarded' && (
                  <div className="mb-6 p-4 bg-surface-light rounded-lg space-y-3">
                    <h3 className="font-medium text-body-dark text-sm">Edit Employee</h3>
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Job Title</label>
                      <input
                        type="text"
                        value={editJobTitle}
                        onChange={(e) => setEditJobTitle(e.target.value)}
                        className="input w-full text-sm"
                        placeholder="Job title"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Department</label>
                      <input
                        type="text"
                        value={editDepartment}
                        onChange={(e) => setEditDepartment(e.target.value)}
                        className="input w-full text-sm"
                        placeholder="Department"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleModify}
                        disabled={actionLoading === 'modify'}
                        className="btn-primary px-3 py-1.5 text-sm"
                      >
                        {actionLoading === 'modify' ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setEditMode(false)}
                        className="px-3 py-1.5 text-sm text-text-muted hover:text-body-dark"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Offboard modal */}
                {showOffboardModal && (
                  <div className="mb-6 p-4 bg-danger/5 border border-danger/20 rounded-lg space-y-3">
                    <h3 className="font-medium text-danger-dark text-sm">Offboard Employee</h3>
                    <p className="text-xs text-text-muted">This will disable their Azure AD account.</p>
                    <textarea
                      value={offboardReason}
                      onChange={(e) => setOffboardReason(e.target.value)}
                      className="input w-full text-sm"
                      placeholder="Reason for offboarding (required)"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleOffboard}
                        disabled={actionLoading === 'offboard' || !offboardReason.trim()}
                        className="bg-danger text-white px-3 py-1.5 text-sm rounded-lg hover:bg-danger-dark transition-colors disabled:opacity-50"
                      >
                        {actionLoading === 'offboard' ? 'Processing...' : 'Confirm Offboard'}
                      </button>
                      <button
                        onClick={() => { setShowOffboardModal(false); setOffboardReason(''); }}
                        className="px-3 py-1.5 text-sm text-text-muted hover:text-body-dark"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {selectedEmployee.status === 'completed' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditMode(true);
                        setEditJobTitle(selectedEmployee.jobTitle || '');
                        setEditDepartment(selectedEmployee.department || '');
                      }}
                      className="btn-primary px-3 py-1.5 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleResendCredentials}
                      disabled={actionLoading === 'resend'}
                      className="bg-info text-white px-3 py-1.5 text-sm rounded-lg hover:bg-info-dark transition-colors disabled:opacity-50"
                    >
                      {actionLoading === 'resend' ? 'Sending...' : 'Resend Credentials'}
                    </button>
                    <button
                      onClick={() => setShowOffboardModal(true)}
                      className="bg-danger/10 text-danger px-3 py-1.5 text-sm rounded-lg hover:bg-danger/20 transition-colors"
                    >
                      Offboard
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-body-dark font-medium text-right max-w-[60%] break-all">{value}</span>
    </div>
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
