'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { privilegedAPI, ApprovalRequest, ApprovalResult } from '@/lib/api';
import { DashboardLayout } from '@/components';

export default function ApprovalsPage() {
  const router = useRouter();
  const { session, user } = useAuthStore();

  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string; data?: ApprovalResult['data'] } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const isITAdmin = user?.role === 'it_admin';

  const loadApprovals = useCallback(async () => {
    if (!session?.accessToken) return;

    setLoading(true);
    setError('');
    try {
      const response = await privilegedAPI.getApprovals(session.accessToken);
      setApprovals(response.requests);
    } catch (err: any) {
      console.error('Failed to load approvals:', err);
      setError(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!isITAdmin) {
      router.push('/dashboard');
      return;
    }

    loadApprovals();

    // Poll for new approvals every 10 seconds
    const interval = setInterval(loadApprovals, 10000);
    return () => clearInterval(interval);
  }, [user, isITAdmin, router, loadApprovals]);

  const handleApprove = async (approvalId: string) => {
    if (!session?.accessToken) return;

    setProcessingId(approvalId);
    setResult(null);
    try {
      const response = await privilegedAPI.approveRequest(session.accessToken, approvalId);

      if (response.success) {
        setResult({
          type: 'success',
          message: response.message,
          data: response.data,
        });
        // Remove from list
        setApprovals(prev => prev.filter(a => a.id !== approvalId));
      } else {
        setResult({ type: 'error', message: 'Failed to approve request' });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Failed to approve request' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (approvalId: string) => {
    if (!session?.accessToken || !rejectReason.trim()) return;

    setProcessingId(approvalId);
    setResult(null);
    try {
      const response = await privilegedAPI.rejectRequest(session.accessToken, approvalId, rejectReason);

      if (response.success) {
        setResult({ type: 'success', message: 'Request rejected successfully' });
        setApprovals(prev => prev.filter(a => a.id !== approvalId));
        setRejectingId(null);
        setRejectReason('');
      } else {
        setResult({ type: 'error', message: 'Failed to reject request' });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Failed to reject request' });
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'password_reset':
        return (
          <svg className="h-6 w-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        );
      case 'account_disable':
        return (
          <svg className="h-6 w-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      case 'account_enable':
        return (
          <svg className="h-6 w-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-6 w-6 text-text-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
    }
  };

  if (!user || !isITAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="spinner mx-auto mb-4 h-8 w-8"></div>
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-primary-dark">Pending Approvals</h1>
            <p className="mt-1 text-text-muted">Review and approve privileged action requests</p>
          </div>
          <button
            onClick={loadApprovals}
            disabled={loading}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Result notification */}
        {result && (
          <div className={`rounded-lg p-4 ${result.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
            <div className="flex items-start">
              {result.type === 'success' ? (
                <svg className="h-5 w-5 text-success mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-danger mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="flex-1">
                <p className={`font-medium ${result.type === 'success' ? 'text-success-dark' : 'text-danger-dark'}`}>
                  {result.message}
                </p>
                {result.data?.temporaryPassword && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-success/20">
                    <p className="text-sm text-body-dark mb-1">Temporary Password:</p>
                    <code className="text-lg font-mono font-bold text-success bg-success/10 px-2 py-1 rounded">
                      {result.data.temporaryPassword}
                    </code>
                    <p className="text-xs text-text-muted mt-2">
                      This password has been sent to the user's chat. They will be prompted to change it on first login.
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setResult(null)}
                className="text-text-gray hover:text-body-dark transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert-danger">
            <p className="text-sm text-danger-dark">{error}</p>
          </div>
        )}

        {/* Approvals list */}
        {loading && approvals.length === 0 ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-surface-light" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-12 card">
            <svg className="mx-auto h-12 w-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-heading font-medium text-body-dark">No pending approvals</h3>
            <p className="mt-2 text-text-muted">All approval requests have been processed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <div
                key={approval.id}
                className="card overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 p-3 bg-surface-light rounded-lg">
                        {getActionIcon(approval.actionType)}
                      </div>
                      <div>
                        <h3 className="text-lg font-heading font-semibold text-body-dark">
                          {approval.actionTypeDisplay}
                        </h3>
                        <p className="text-sm text-text-muted mt-1">
                          Ticket: {approval.ticketSubject}
                        </p>
                      </div>
                    </div>
                    <span className="badge-warning">
                      Pending
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-text-muted">Requested by:</span>
                      <p className="font-medium text-body-dark">{approval.requestedBy.name || 'Unknown User'}</p>
                      <p className="text-text-muted">{approval.requestedBy.email || 'Email not available'}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">Target account:</span>
                      <p className="font-medium text-body-dark">{approval.targetEmail || approval.requestedBy.email || 'Same as requester'}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <span className="text-sm text-text-muted">Justification:</span>
                    <p className="text-sm text-body-dark mt-1 bg-surface-light p-3 rounded-lg">
                      {approval.justification}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-text-gray">
                    <span>Created: {formatDate(approval.createdAt)}</span>
                    <span>Expires: {formatDate(approval.expiresAt)}</span>
                  </div>
                </div>

                {/* Rejection form */}
                {rejectingId === approval.id && (
                  <div className="px-6 py-4 bg-surface-light border-t border-border-light">
                    <label className="block text-sm font-medium text-body-dark mb-2">
                      Rejection reason:
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="input w-full"
                      rows={2}
                      placeholder="Enter reason for rejection..."
                    />
                    <div className="mt-3 flex space-x-2">
                      <button
                        onClick={() => handleReject(approval.id)}
                        disabled={!rejectReason.trim() || processingId === approval.id}
                        className="btn-danger flex-1"
                      >
                        {processingId === approval.id ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {rejectingId !== approval.id && (
                  <div className="px-6 py-4 bg-surface-light border-t border-border-light flex justify-end space-x-3">
                    <button
                      onClick={() => setRejectingId(approval.id)}
                      disabled={processingId === approval.id}
                      className="btn-secondary"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(approval.id)}
                      disabled={processingId === approval.id}
                      className="btn-success flex items-center space-x-2"
                    >
                      {processingId === approval.id ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Approve & Execute</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
