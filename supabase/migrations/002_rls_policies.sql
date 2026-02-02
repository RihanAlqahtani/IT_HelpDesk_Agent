-- ============================================================================
-- IT Helpdesk Agent - Row Level Security Policies
-- Migration: 002_rls_policies.sql
-- Description: Implements strict RLS policies for all IT tables (it_* prefix)
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's role name
CREATE OR REPLACE FUNCTION public.get_it_user_role()
RETURNS TEXT AS $$
DECLARE
    role_name TEXT;
BEGIN
    SELECT r.name INTO role_name
    FROM public.it_users u
    JOIN public.it_roles r ON u.role_id = r.id
    WHERE u.id = auth.uid();

    RETURN role_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user has IT role (it_support or it_admin)
CREATE OR REPLACE FUNCTION public.is_it_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_it_user_role() IN ('it_support', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is IT admin
CREATE OR REPLACE FUNCTION public.is_it_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_it_user_role() = 'it_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENABLE RLS ON ALL IT TABLES
-- ============================================================================
ALTER TABLE public.it_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_privileged_action_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- IT_USERS TABLE POLICIES
-- ============================================================================

-- Users can read their own profile
CREATE POLICY it_users_select_own ON public.it_users
    FOR SELECT
    USING (id = auth.uid());

-- IT staff can read all users
CREATE POLICY it_users_select_it ON public.it_users
    FOR SELECT
    USING (public.is_it_staff());

-- IT admin can update users (except own role)
CREATE POLICY it_users_update_admin ON public.it_users
    FOR UPDATE
    USING (public.is_it_admin())
    WITH CHECK (
        public.is_it_admin()
        AND (id != auth.uid() OR role_id = (SELECT role_id FROM public.it_users WHERE id = auth.uid()))
    );

-- Users can update their own non-sensitive fields
CREATE POLICY it_users_update_own ON public.it_users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role_id = (SELECT role_id FROM public.it_users WHERE id = auth.uid())
    );

-- ============================================================================
-- IT_ROLES TABLE POLICIES
-- ============================================================================

-- All authenticated users can read roles
CREATE POLICY it_roles_select_all ON public.it_roles
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only IT admin can modify roles
CREATE POLICY it_roles_modify_admin ON public.it_roles
    FOR ALL
    USING (public.is_it_admin())
    WITH CHECK (public.is_it_admin());

-- ============================================================================
-- IT_PERMISSIONS TABLE POLICIES
-- ============================================================================

-- All authenticated users can read permissions
CREATE POLICY it_permissions_select_all ON public.it_permissions
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only IT admin can modify permissions
CREATE POLICY it_permissions_modify_admin ON public.it_permissions
    FOR ALL
    USING (public.is_it_admin())
    WITH CHECK (public.is_it_admin());

-- ============================================================================
-- IT_ROLE_PERMISSIONS TABLE POLICIES
-- ============================================================================

-- All authenticated users can read role_permissions
CREATE POLICY it_role_permissions_select_all ON public.it_role_permissions
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only IT admin can modify role_permissions
CREATE POLICY it_role_permissions_modify_admin ON public.it_role_permissions
    FOR ALL
    USING (public.is_it_admin())
    WITH CHECK (public.is_it_admin());

-- ============================================================================
-- IT_TICKETS TABLE POLICIES
-- ============================================================================

-- Users can read their own tickets
CREATE POLICY it_tickets_select_own ON public.it_tickets
    FOR SELECT
    USING (user_id = auth.uid());

-- IT staff can read all tickets
CREATE POLICY it_tickets_select_it ON public.it_tickets
    FOR SELECT
    USING (public.is_it_staff());

-- Users can create tickets for themselves
CREATE POLICY it_tickets_insert_own ON public.it_tickets
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own open tickets (limited fields)
CREATE POLICY it_tickets_update_own ON public.it_tickets
    FOR UPDATE
    USING (user_id = auth.uid() AND status IN ('open', 'in_progress'))
    WITH CHECK (
        user_id = auth.uid()
        AND status IN ('open', 'in_progress')
    );

-- IT staff can update any ticket
CREATE POLICY it_tickets_update_it ON public.it_tickets
    FOR UPDATE
    USING (public.is_it_staff())
    WITH CHECK (public.is_it_staff());

-- ============================================================================
-- IT_CONVERSATION_HISTORY TABLE POLICIES
-- ============================================================================

-- Users can read conversations for their own tickets
CREATE POLICY it_conversation_select_own ON public.it_conversation_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.it_tickets t
            WHERE t.id = ticket_id AND t.user_id = auth.uid()
        )
    );

-- IT staff can read all conversations
CREATE POLICY it_conversation_select_it ON public.it_conversation_history
    FOR SELECT
    USING (public.is_it_staff());

-- Users can add to conversations for their own tickets
CREATE POLICY it_conversation_insert_own ON public.it_conversation_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.it_tickets t
            WHERE t.id = ticket_id AND t.user_id = auth.uid()
        )
        AND role = 'user'
    );

-- IT staff can add to any conversation
CREATE POLICY it_conversation_insert_it ON public.it_conversation_history
    FOR INSERT
    WITH CHECK (public.is_it_staff());

-- ============================================================================
-- IT_AUDIT_LOGS TABLE POLICIES
-- ============================================================================

-- Only IT admin can read audit logs
CREATE POLICY it_audit_select_admin ON public.it_audit_logs
    FOR SELECT
    USING (public.is_it_admin());

-- No direct inserts allowed via client - use service role only
-- Service role bypasses RLS, so no insert policy needed for regular users

-- ============================================================================
-- IT_APPROVAL_REQUESTS TABLE POLICIES
-- ============================================================================

-- Users can read approval requests for their own tickets
CREATE POLICY it_approval_select_own ON public.it_approval_requests
    FOR SELECT
    USING (
        requested_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.it_tickets t
            WHERE t.id = ticket_id AND t.user_id = auth.uid()
        )
    );

-- IT staff can read all approval requests
CREATE POLICY it_approval_select_it ON public.it_approval_requests
    FOR SELECT
    USING (public.is_it_staff());

-- IT admin can update approval requests (approve/reject)
CREATE POLICY it_approval_update_admin ON public.it_approval_requests
    FOR UPDATE
    USING (public.is_it_admin())
    WITH CHECK (public.is_it_admin());

-- ============================================================================
-- IT_PRIVILEGED_ACTION_LOGS TABLE POLICIES
-- ============================================================================

-- Only IT admin can read privileged action logs
CREATE POLICY it_privileged_logs_select_admin ON public.it_privileged_action_logs
    FOR SELECT
    USING (public.is_it_admin());

-- No direct inserts allowed via client - use service role only
