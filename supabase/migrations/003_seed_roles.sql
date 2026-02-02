-- ============================================================================
-- IT Helpdesk Agent - Seed Data
-- Migration: 003_seed_roles.sql
-- Description: Seeds it_roles, it_permissions, and it_role_permissions
-- ============================================================================

-- ============================================================================
-- SEED IT_ROLES
-- ============================================================================
INSERT INTO public.it_roles (name, description, level, can_access_admin) VALUES
    ('employee', 'Regular employee - can create and view own tickets', 1, false),
    ('it_support', 'IT Support staff - can respond to and manage tickets', 2, false),
    ('it_admin', 'IT Administrator - full system access', 3, true),
    ('system_service', 'System service account - backend only', 4, false)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    can_access_admin = EXCLUDED.can_access_admin;

-- ============================================================================
-- SEED IT_PERMISSIONS
-- MVP: Ticket permissions enabled, privileged permissions disabled
-- ============================================================================

-- Ticket permissions (MVP - enabled)
INSERT INTO public.it_permissions (name, description, is_privileged, is_enabled, minimum_role) VALUES
    ('ticket.read', 'View tickets', false, true, 'employee'),
    ('ticket.create', 'Create new tickets', false, true, 'employee'),
    ('ticket.respond', 'Respond to tickets', false, true, 'it_support'),
    ('ticket.escalate', 'Escalate tickets', false, true, 'it_support'),
    ('ticket.close', 'Close tickets', false, true, 'it_support')
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_privileged = EXCLUDED.is_privileged,
    is_enabled = EXCLUDED.is_enabled,
    minimum_role = EXCLUDED.minimum_role;

-- Privileged permissions (MVP - DISABLED but code checks exist)
INSERT INTO public.it_permissions (name, description, is_privileged, is_enabled, minimum_role) VALUES
    ('account.create', 'Create user accounts', true, false, 'it_admin'),
    ('account.modify', 'Modify user accounts', true, false, 'it_admin'),
    ('account.disable', 'Disable user accounts', true, false, 'it_admin'),
    ('password.reset', 'Reset user passwords', true, false, 'it_admin'),
    ('permission.modify', 'Modify user permissions', true, false, 'it_admin'),
    ('onboarding.execute', 'Execute employee onboarding workflows', true, false, 'it_admin'),
    ('offboarding.execute', 'Execute employee offboarding workflows', true, false, 'it_admin')
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_privileged = EXCLUDED.is_privileged,
    is_enabled = EXCLUDED.is_enabled,
    minimum_role = EXCLUDED.minimum_role;

-- ============================================================================
-- SEED IT_ROLE_PERMISSIONS
-- ============================================================================

-- Employee permissions
INSERT INTO public.it_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.it_roles r
CROSS JOIN public.it_permissions p
WHERE r.name = 'employee'
AND p.name IN ('ticket.read', 'ticket.create')
ON CONFLICT DO NOTHING;

-- IT Support permissions (includes employee permissions)
INSERT INTO public.it_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.it_roles r
CROSS JOIN public.it_permissions p
WHERE r.name = 'it_support'
AND p.name IN ('ticket.read', 'ticket.create', 'ticket.respond', 'ticket.escalate', 'ticket.close')
ON CONFLICT DO NOTHING;

-- IT Admin permissions (all permissions)
INSERT INTO public.it_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.it_roles r
CROSS JOIN public.it_permissions p
WHERE r.name = 'it_admin'
ON CONFLICT DO NOTHING;

-- System service has no default permissions (uses service role key)

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Verify roles
-- SELECT * FROM public.it_roles ORDER BY level;

-- Verify permissions
-- SELECT * FROM public.it_permissions ORDER BY is_privileged, name;

-- Verify role_permissions
-- SELECT r.name as role, p.name as permission, p.is_enabled
-- FROM public.it_role_permissions rp
-- JOIN public.it_roles r ON rp.role_id = r.id
-- JOIN public.it_permissions p ON rp.permission_id = p.id
-- ORDER BY r.level, p.name;
