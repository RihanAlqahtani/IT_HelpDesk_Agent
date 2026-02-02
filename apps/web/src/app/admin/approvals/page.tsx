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
          <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        );
      case 'account_disable':
        return (
          <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      case 'account_enable':
        return (
          <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p className="text-sm text-gray-500">Loading...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
            <p className="mt-1 text-gray-500">Review and approve privileged action requests</p>
          </div>
          <button
            onClick={loadApprovals}
            disabled={loading}
            className="flex items-center space-x-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Result notification */}
        {result && (
          <div className={`rounded-lg p-4 ${result.type === 'success' ? 'bg-green-50 ring-1 ring-green-200' : 'bg-red-50 ring-1 ring-red-200'}`}>
            <div className="flex items-start">
              {result.type === 'success' ? (
                <svg className="h-5 w-5 text-green-500 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-500 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="flex-1">
                <p className={`font-medium ${result.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                  {result.message}
                </p>
                {result.data?.temporaryPassword && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-sm text-gray-600 mb-1">Temporary Password:</p>
                    <code className="text-lg font-mono font-bold text-green-700 bg-green-100 px-2 py-1 rounded">
                      {result.data.temporaryPassword}
                    </code>
                    <p className="text-xs text-gray-500 mt-2">
                      This password has been sent to the user's chat. They will be prompted to change it on first login.
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setResult(null)}
                className="text-gray-400 hover:text-gray-600"
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
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-100">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Approvals list */}
        {loading && approvals.length === 0 ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm ring-1 ring-gray-100">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No pending approvals</h3>
            <p className="mt-2 text-gray-500">All approval requests have been processed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <div
                key={approval.id}
                className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 p-3 bg-gray-50 rounded-lg">
                        {getActionIcon(approval.actionType)}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {approval.actionTypeDisplay}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Ticket: {approval.ticketSubject}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      Pending
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Requested by:</span>
                      <p className="font-medium text-gray-900">{approval.requestedBy.name}</p>
                      <p className="text-gray-500">{approval.requestedBy.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Target account:</span>
                      <p className="font-medium text-gray-900">{approval.targetEmail}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <span className="text-sm text-gray-500">Justification:</span>
                    <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-3 rounded-lg">
                      {approval.justification}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>Created: {formatDate(approval.createdAt)}</span>
                    <span>Expires: {formatDate(approval.expiresAt)}</span>
                  </div>
                </div>

                {/* Rejection form */}
                {rejectingId === approval.id && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rejection reason:
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      rows={2}
                      placeholder="Enter reason for rejection..."
                    />
                    <div className="mt-3 flex space-x-2">
                      <button
                        onClick={() => handleReject(approval.id)}
                        disabled={!rejectReason.trim() || processingId === approval.id}
                        className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {processingId === approval.id ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {rejectingId !== approval.id && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
                    <button
                      onClick={() => setRejectingId(approval.id)}
                      disabled={processingId === approval.id}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(approval.id)}
                      disabled={processingId === approval.id}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
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
