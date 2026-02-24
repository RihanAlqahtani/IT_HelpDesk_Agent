-- ============================================================================
-- IT Helpdesk Agent - HR Onboarding Architecture
-- Migration: 005_hr_onboarding.sql
-- Description: Adds HR role, onboarding permissions, and onboarding records table
-- Date: 2026-02-12
--
-- SAFETY: All changes are ADDITIVE. No existing tables are modified destructively.
-- Existing data in it_users, it_tickets, it_conversations, etc. is untouched.
-- ============================================================================

-- ============================================================================
-- 1. ADD HR ROLE
-- ============================================================================

-- Update the CHECK constraint on it_roles to allow 'hr'
ALTER TABLE it_roles DROP CONSTRAINT IF EXISTS it_roles_name_check;
ALTER TABLE it_roles ADD CONSTRAINT it_roles_name_check
    CHECK (name IN ('employee', 'it_support', 'it_admin', 'system_service', 'hr'));

INSERT INTO it_roles (name, description, level, can_access_admin)
VALUES ('hr', 'HR staff - manages onboarding, offboarding, and employee updates', 2, true)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    can_access_admin = EXCLUDED.can_access_admin;

-- ============================================================================
-- 2. ADD / UPDATE PERMISSIONS FOR HR
-- ============================================================================

-- Enable onboarding and offboarding permissions (were disabled in MVP)
UPDATE it_permissions
SET is_enabled = true
WHERE name IN ('onboarding.execute', 'offboarding.execute');

-- Add new employee.modify permission
INSERT INTO it_permissions (name, description, is_privileged, is_enabled, minimum_role)
VALUES ('employee.modify', 'Modify employee Azure AD properties (department, job title)', true, true, 'hr')
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_privileged = EXCLUDED.is_privileged,
    is_enabled = EXCLUDED.is_enabled,
    minimum_role = EXCLUDED.minimum_role;

-- ============================================================================
-- 3. ASSIGN PERMISSIONS TO HR ROLE
-- ============================================================================

-- HR gets onboarding, offboarding, employee modify, and basic ticket permissions
INSERT INTO it_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM it_roles r
CROSS JOIN it_permissions p
WHERE r.name = 'hr'
AND p.name IN (
    'onboarding.execute',
    'offboarding.execute',
    'employee.modify',
    'ticket.read',
    'ticket.create'
)
ON CONFLICT DO NOTHING;

-- IT Admin also gets the new employee.modify permission
INSERT INTO it_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM it_roles r
CROSS JOIN it_permissions p
WHERE r.name = 'it_admin'
AND p.name = 'employee.modify'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. ONBOARDING RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS it_onboarding_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Employee info (submitted via public form)
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    personal_email TEXT NOT NULL,
    job_title TEXT,
    department TEXT,

    -- Generated data
    user_principal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,

    -- Azure AD result
    azure_object_id TEXT UNIQUE,

    -- License info
    license_assigned TEXT,

    -- Credential delivery tracking
    credentials_emailed BOOLEAN NOT NULL DEFAULT false,
    credentials_emailed_at TIMESTAMPTZ,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'provisioning', 'completed', 'failed', 'offboarded')),
    error_message TEXT,

    -- Offboarding fields
    offboarded_at TIMESTAMPTZ,
    offboarded_by UUID REFERENCES it_users(id),
    offboard_reason TEXT,

    -- Modification tracking
    last_modified_at TIMESTAMPTZ,
    last_modified_by UUID REFERENCES it_users(id),

    -- Audit / security
    submitted_from_ip TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. LINK DIRECTORY USERS TABLE (additive column)
-- ============================================================================

ALTER TABLE it_directory_users
    ADD COLUMN IF NOT EXISTS onboarding_record_id UUID REFERENCES it_onboarding_records(id);

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onboarding_records_status
    ON it_onboarding_records(status);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_upn
    ON it_onboarding_records(user_principal_name);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_azure
    ON it_onboarding_records(azure_object_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_personal_email
    ON it_onboarding_records(personal_email);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_created_at
    ON it_onboarding_records(created_at DESC);

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE it_onboarding_records ENABLE ROW LEVEL SECURITY;

-- HR and IT Admin can SELECT onboarding records
CREATE POLICY onboarding_records_select_hr_admin ON it_onboarding_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name IN ('hr', 'it_admin')
        )
    );

-- HR and IT Admin can INSERT onboarding records
CREATE POLICY onboarding_records_insert_hr_admin ON it_onboarding_records
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name IN ('hr', 'it_admin')
        )
    );

-- HR and IT Admin can UPDATE onboarding records
CREATE POLICY onboarding_records_update_hr_admin ON it_onboarding_records
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name IN ('hr', 'it_admin')
        )
    );

-- ============================================================================
-- 8. AUTO-UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_onboarding_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_onboarding_records_updated_at
    BEFORE UPDATE ON it_onboarding_records
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_records_updated_at();

-- ============================================================================
-- 9. UPDATE RLS HELPER FUNCTIONS (add HR to is_it_staff check)
-- ============================================================================

-- Update the is_it_staff function to include HR
CREATE OR REPLACE FUNCTION public.is_it_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.it_users u
        JOIN public.it_roles r ON u.role_id = r.id
        WHERE u.id = auth.uid()
        AND r.name IN ('it_support', 'it_admin', 'hr')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add HR check helper
CREATE OR REPLACE FUNCTION public.is_hr()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.it_users u
        JOIN public.it_roles r ON u.role_id = r.id
        WHERE u.id = auth.uid()
        AND r.name = 'hr'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE it_onboarding_records IS 'Tracks employee onboarding via public form submission';
COMMENT ON COLUMN it_onboarding_records.personal_email IS 'Employee personal email for credential delivery';
COMMENT ON COLUMN it_onboarding_records.credentials_emailed IS 'Whether credentials were successfully sent via email';
COMMENT ON COLUMN it_onboarding_records.submitted_from_ip IS 'IP address of form submission for audit';
COMMENT ON COLUMN it_onboarding_records.status IS 'Lifecycle: pending -> provisioning -> completed/failed, or offboarded';

-- ============================================================================
-- VERIFICATION (uncomment to test)
-- ============================================================================
-- SELECT name, level, can_access_admin FROM it_roles ORDER BY level;
-- SELECT name, is_enabled, minimum_role FROM it_permissions WHERE name IN ('onboarding.execute', 'offboarding.execute', 'employee.modify');
-- SELECT r.name as role, p.name as permission FROM it_role_permissions rp JOIN it_roles r ON rp.role_id = r.id JOIN it_permissions p ON rp.permission_id = p.id WHERE r.name = 'hr';
