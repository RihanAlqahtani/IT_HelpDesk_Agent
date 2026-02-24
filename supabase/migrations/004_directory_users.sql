-- Migration: 004_directory_users
-- Description: Create table for tracking Azure AD users created through our system
-- Date: 2026-02-10

-- =============================================================================
-- IT DIRECTORY USERS TABLE
-- Tracks Azure AD users created through the IT Helpdesk system
-- =============================================================================

CREATE TABLE IF NOT EXISTS it_directory_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Azure AD identifiers
    azure_object_id TEXT NOT NULL UNIQUE,
    user_principal_name TEXT NOT NULL UNIQUE,

    -- User details (snapshot at creation time)
    display_name TEXT NOT NULL,
    given_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    job_title TEXT,
    department TEXT,

    -- License info
    license_sku_id TEXT,
    license_sku_part_number TEXT,
    license_display_name TEXT,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled', 'deleted')),

    -- Audit fields
    created_by UUID NOT NULL REFERENCES it_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,
    disabled_by UUID REFERENCES it_users(id),
    disabled_reason TEXT,

    -- Metadata for any additional info
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_directory_users_upn
    ON it_directory_users(user_principal_name);

CREATE INDEX IF NOT EXISTS idx_directory_users_azure_id
    ON it_directory_users(azure_object_id);

CREATE INDEX IF NOT EXISTS idx_directory_users_status
    ON it_directory_users(status);

CREATE INDEX IF NOT EXISTS idx_directory_users_created_by
    ON it_directory_users(created_by);

CREATE INDEX IF NOT EXISTS idx_directory_users_department
    ON it_directory_users(department);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE it_directory_users ENABLE ROW LEVEL SECURITY;

-- IT Admins can view all directory users
CREATE POLICY directory_users_select_it_admin ON it_directory_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name = 'it_admin'
        )
    );

-- IT Admins can insert directory users
CREATE POLICY directory_users_insert_it_admin ON it_directory_users
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name = 'it_admin'
        )
    );

-- IT Admins can update directory users
CREATE POLICY directory_users_update_it_admin ON it_directory_users
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM it_users u
            JOIN it_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()
            AND r.name = 'it_admin'
        )
    );

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_directory_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_directory_users_updated_at
    BEFORE UPDATE ON it_directory_users
    FOR EACH ROW
    EXECUTE FUNCTION update_directory_users_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE it_directory_users IS 'Tracks Azure AD users created through the IT Helpdesk system';
COMMENT ON COLUMN it_directory_users.azure_object_id IS 'Azure AD Object ID (GUID)';
COMMENT ON COLUMN it_directory_users.user_principal_name IS 'Azure AD UPN (email format)';
COMMENT ON COLUMN it_directory_users.license_sku_id IS 'Azure license SKU ID assigned at creation';
COMMENT ON COLUMN it_directory_users.status IS 'Current status: active, disabled, or deleted';
