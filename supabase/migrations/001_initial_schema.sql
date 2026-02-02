-- ============================================================================
-- IT Helpdesk Agent - Initial Schema
-- Migration: 001_initial_schema.sql
-- Description: Creates all tables for the IT Helpdesk Agent system
-- Note: All IT tables use 'it_' prefix to avoid collision with other schemas
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. IT_ROLES TABLE
-- Defines system roles: employee, it_support, it_admin, system_service
-- ============================================================================
CREATE TABLE public.it_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE CHECK (name IN ('employee', 'it_support', 'it_admin', 'system_service')),
    description TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    can_access_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for role lookups
CREATE INDEX idx_it_roles_name ON public.it_roles(name);

-- ============================================================================
-- 2. IT_PERMISSIONS TABLE
-- Defines all system permissions (capabilities)
-- ============================================================================
CREATE TABLE public.it_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_privileged BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT false,
    minimum_role TEXT REFERENCES public.it_roles(name),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for permission lookups
CREATE INDEX idx_it_permissions_name ON public.it_permissions(name);
CREATE INDEX idx_it_permissions_privileged ON public.it_permissions(is_privileged);

-- ============================================================================
-- 3. IT_ROLE_PERMISSIONS TABLE (Many-to-Many)
-- Links roles to their permissions
-- ============================================================================
CREATE TABLE public.it_role_permissions (
    role_id UUID NOT NULL REFERENCES public.it_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.it_permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- Indexes for it_role_permissions
CREATE INDEX idx_it_role_permissions_role ON public.it_role_permissions(role_id);
CREATE INDEX idx_it_role_permissions_permission ON public.it_role_permissions(permission_id);

-- ============================================================================
-- 4. IT_USERS TABLE
-- Extends Supabase auth.users with additional profile information
-- ============================================================================
CREATE TABLE public.it_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    department TEXT,
    role_id UUID NOT NULL REFERENCES public.it_roles(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_users
CREATE INDEX idx_it_users_email ON public.it_users(email);
CREATE INDEX idx_it_users_role ON public.it_users(role_id);
CREATE INDEX idx_it_users_active ON public.it_users(is_active);

-- ============================================================================
-- 5. IT_TICKETS TABLE
-- Stores IT support tickets
-- ============================================================================
CREATE TABLE public.it_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.it_users(id),
    assigned_to UUID REFERENCES public.it_users(id),
    category TEXT NOT NULL CHECK (category IN (
        'login_password',
        'email',
        'network_wifi',
        'vpn',
        'software_installation',
        'hardware',
        'security'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open',
        'in_progress',
        'awaiting_approval',
        'escalated',
        'resolved',
        'closed'
    )),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    resolution TEXT,
    escalated_at TIMESTAMPTZ,
    escalation_reason TEXT,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_tickets
CREATE INDEX idx_it_tickets_user ON public.it_tickets(user_id);
CREATE INDEX idx_it_tickets_assigned ON public.it_tickets(assigned_to);
CREATE INDEX idx_it_tickets_status ON public.it_tickets(status);
CREATE INDEX idx_it_tickets_category ON public.it_tickets(category);
CREATE INDEX idx_it_tickets_severity ON public.it_tickets(severity);
CREATE INDEX idx_it_tickets_created ON public.it_tickets(created_at DESC);

-- ============================================================================
-- 6. IT_CONVERSATION_HISTORY TABLE
-- Stores chat history between users and the AI agent
-- ============================================================================
CREATE TABLE public.it_conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
    content TEXT NOT NULL,
    agent_response JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_conversation_history
CREATE INDEX idx_it_conversation_ticket ON public.it_conversation_history(ticket_id);
CREATE INDEX idx_it_conversation_created ON public.it_conversation_history(created_at);

-- ============================================================================
-- 7. IT_AUDIT_LOGS TABLE
-- Immutable audit trail for all system actions
-- ============================================================================
CREATE TABLE public.it_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.it_users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_audit_logs
CREATE INDEX idx_it_audit_user ON public.it_audit_logs(user_id);
CREATE INDEX idx_it_audit_action ON public.it_audit_logs(action);
CREATE INDEX idx_it_audit_resource ON public.it_audit_logs(resource_type, resource_id);
CREATE INDEX idx_it_audit_created ON public.it_audit_logs(created_at DESC);

-- Prevent updates and deletes on it_audit_logs (immutable)
CREATE OR REPLACE FUNCTION prevent_it_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER it_audit_logs_immutable_update
    BEFORE UPDATE ON public.it_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_it_audit_modification();

CREATE TRIGGER it_audit_logs_immutable_delete
    BEFORE DELETE ON public.it_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_it_audit_modification();

-- ============================================================================
-- 8. IT_APPROVAL_REQUESTS TABLE (Future)
-- Stores requests for privileged actions that require approval
-- ============================================================================
CREATE TABLE public.it_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.it_tickets(id),
    requested_by UUID NOT NULL REFERENCES public.it_users(id),
    approved_by UUID REFERENCES public.it_users(id),
    action_type TEXT NOT NULL,
    action_payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'approved',
        'rejected',
        'expired',
        'executed'
    )),
    justification TEXT,
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_approval_requests
CREATE INDEX idx_it_approval_ticket ON public.it_approval_requests(ticket_id);
CREATE INDEX idx_it_approval_requested_by ON public.it_approval_requests(requested_by);
CREATE INDEX idx_it_approval_status ON public.it_approval_requests(status);
CREATE INDEX idx_it_approval_created ON public.it_approval_requests(created_at DESC);

-- ============================================================================
-- 9. IT_PRIVILEGED_ACTION_LOGS TABLE (Future)
-- Detailed logs of privileged actions executed
-- ============================================================================
CREATE TABLE public.it_privileged_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id UUID REFERENCES public.it_approval_requests(id),
    ticket_id UUID NOT NULL REFERENCES public.it_tickets(id),
    executed_by UUID NOT NULL REFERENCES public.it_users(id),
    action_type TEXT NOT NULL,
    target_identifier TEXT NOT NULL,
    action_details JSONB NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'partial')),
    error_message TEXT,
    rollback_data JSONB,
    is_reversed BOOLEAN DEFAULT false,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES public.it_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for it_privileged_action_logs
CREATE INDEX idx_it_privileged_ticket ON public.it_privileged_action_logs(ticket_id);
CREATE INDEX idx_it_privileged_executed_by ON public.it_privileged_action_logs(executed_by);
CREATE INDEX idx_it_privileged_action_type ON public.it_privileged_action_logs(action_type);
CREATE INDEX idx_it_privileged_result ON public.it_privileged_action_logs(result);
CREATE INDEX idx_it_privileged_created ON public.it_privileged_action_logs(created_at DESC);

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGERS
-- Automatically update updated_at on row changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_it_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER it_users_updated_at
    BEFORE UPDATE ON public.it_users
    FOR EACH ROW
    EXECUTE FUNCTION update_it_updated_at();

CREATE TRIGGER it_roles_updated_at
    BEFORE UPDATE ON public.it_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_it_updated_at();

CREATE TRIGGER it_permissions_updated_at
    BEFORE UPDATE ON public.it_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_it_updated_at();

CREATE TRIGGER it_tickets_updated_at
    BEFORE UPDATE ON public.it_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_it_updated_at();

CREATE TRIGGER it_approval_requests_updated_at
    BEFORE UPDATE ON public.it_approval_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_it_updated_at();
