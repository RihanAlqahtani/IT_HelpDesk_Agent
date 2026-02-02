/**
 * API Client
 *
 * Handles all API requests to the backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * API Error class
 */
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new APIError(response.status, error.message || 'Request failed', error.code);
  }

  return response.json();
}

// =============================================================================
// AUTH API
// =============================================================================

export const authAPI = {
  signIn: async (email: string, password: string) => {
    return apiRequest<{
      user: { id: string; email: string; fullName: string; role: string };
      session: { accessToken: string; refreshToken: string; expiresAt: number };
    }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  signUp: async (email: string, password: string, fullName: string, department?: string) => {
    return apiRequest<{ message: string; user: { id: string; email: string } }>(
      '/api/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, department }),
      }
    );
  },

  getProfile: async (accessToken: string) => {
    return apiRequest<{
      user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        permissions: string[];
      };
    }>('/api/auth/me', {}, accessToken);
  },

  refresh: async (refreshToken: string) => {
    return apiRequest<{
      session: { accessToken: string; refreshToken: string; expiresAt: number };
    }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
};

// =============================================================================
// TICKETS API
// =============================================================================

export interface Ticket {
  id: string;
  ticketNumber: number;
  userId: string;
  assignedTo?: string;
  category: string;
  severity: string;
  status: string;
  subject: string;
  description: string;
  resolution?: string;
  escalatedAt?: string;
  escalationReason?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const ticketsAPI = {
  list: async (
    accessToken: string,
    params?: { page?: number; pageSize?: number; status?: string; category?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);

    const queryString = query.toString();
    const endpoint = `/api/tickets${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      tickets: Ticket[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    }>(endpoint, {}, accessToken);
  },

  get: async (accessToken: string, ticketId: string) => {
    return apiRequest<Ticket>(`/api/tickets/${ticketId}`, {}, accessToken);
  },

  create: async (
    accessToken: string,
    data: { subject: string; description: string; category: string; severity?: string }
  ) => {
    return apiRequest<Ticket>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }, accessToken);
  },

  update: async (accessToken: string, ticketId: string, data: Partial<Ticket>) => {
    return apiRequest<Ticket>(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, accessToken);
  },

  escalate: async (accessToken: string, ticketId: string, reason: string, details: string) => {
    return apiRequest<Ticket>(`/api/tickets/${ticketId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }, accessToken);
  },

  resolve: async (accessToken: string, ticketId: string, resolution: string) => {
    return apiRequest<Ticket>(`/api/tickets/${ticketId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }, accessToken);
  },

  getStats: async (accessToken: string) => {
    return apiRequest<{
      total: number;
      open: number;
      inProgress: number;
      escalated: number;
      resolved: number;
      byCategory: Record<string, number>;
      bySeverity: Record<string, number>;
    }>('/api/tickets/stats', {}, accessToken);
  },

  /** Get detailed ticket info for IT staff (includes user info) */
  getDetails: async (accessToken: string, ticketId: string) => {
    return apiRequest<{
      ticket: Ticket;
      user: { id: string; email: string; fullName: string; department?: string } | null;
    }>(`/api/tickets/${ticketId}/details`, {}, accessToken);
  },
};

// =============================================================================
// AGENT API
// =============================================================================

export interface AgentResponse {
  decision: 'guide' | 'resolve' | 'escalate' | 'request_approval';
  category: string;
  severity: string;
  clarifying_questions: string[];
  troubleshooting_steps: Array<{
    step_number: number;
    instruction: string;
    expected_outcome: string;
  }>;
  proposed_privileged_action: null;
  escalation_summary: { reason: string; details: string } | null;
}

export interface ConversationMessage {
  id: string;
  ticketId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  agentResponse?: AgentResponse;
  createdAt: string;
}

export const agentAPI = {
  /** Start a new conversation - AI classifies and creates the ticket */
  startConversation: async (accessToken: string, message: string) => {
    return apiRequest<{
      ticket: Ticket;
      response: AgentResponse;
      conversationId: string;
    }>('/api/agent/start', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }, accessToken);
  },

  chat: async (accessToken: string, ticketId: string, message: string) => {
    return apiRequest<{
      response: AgentResponse;
      conversationId: string;
      ticketUpdated: boolean;
    }>('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ ticketId, message }),
    }, accessToken);
  },

  getHistory: async (accessToken: string, ticketId: string) => {
    return apiRequest<{ messages: ConversationMessage[] }>(
      `/api/agent/history/${ticketId}`,
      {},
      accessToken
    );
  },

  getSummary: async (accessToken: string, ticketId: string) => {
    return apiRequest<{
      totalMessages: number;
      userMessages: number;
      agentMessages: number;
      lastDecision: string | null;
      stepsProvided: number;
    }>(`/api/agent/summary/${ticketId}`, {}, accessToken);
  },
};

// =============================================================================
// PRIVILEGED ACTIONS API (Admin only)
// =============================================================================

export interface ApprovalRequest {
  id: string;
  ticketId: string;
  ticketSubject: string;
  actionType: string;
  actionTypeDisplay: string;
  targetEmail: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  justification: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalResult {
  success: boolean;
  message: string;
  data?: {
    temporaryPassword?: string;
    message?: string;
  };
}

export const privilegedAPI = {
  /** Get pending approval requests (IT Admin only) */
  getApprovals: async (accessToken: string) => {
    return apiRequest<{
      success: boolean;
      requests: ApprovalRequest[];
      count: number;
    }>('/api/privileged/approvals', {}, accessToken);
  },

  /** Approve a pending request (IT Admin only) */
  approveRequest: async (accessToken: string, approvalId: string) => {
    return apiRequest<ApprovalResult>(`/api/privileged/approvals/${approvalId}/approve`, {
      method: 'POST',
    }, accessToken);
  },

  /** Reject a pending request (IT Admin only) */
  rejectRequest: async (accessToken: string, approvalId: string, reason: string) => {
    return apiRequest<{ success: boolean; message: string }>(
      `/api/privileged/approvals/${approvalId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      accessToken
    );
  },

  /** Get privileged actions status */
  getStatus: async (accessToken: string) => {
    return apiRequest<{
      privilegedActions: { enabled: boolean; message: string };
      approvalWorkflows: { enabled: boolean; message: string };
      azureAD: { configured: boolean; message: string };
      capabilities: {
        passwordReset: boolean;
        accountDisable: boolean;
        accountEnable: boolean;
      };
    }>('/api/privileged/status', {}, accessToken);
  },
};
