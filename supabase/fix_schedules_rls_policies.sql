-- Fix RLS policies for schedules table to allow proper creation/management
-- This addresses the "new row violates row-level security policy" error

BEGIN;

-- Step 1: Remove existing conflicting policies on schedules table
DROP POLICY IF EXISTS "users_view_schedules" ON schedules;
DROP POLICY IF EXISTS "admins_manage_schedules" ON schedules;
DROP POLICY IF EXISTS "Users can view schedules for accessible screens" ON schedules;
DROP POLICY IF EXISTS "Users can manage schedules for accessible screens" ON schedules;
DROP POLICY IF EXISTS "Users can view schedules" ON schedules;
DROP POLICY IF EXISTS "Users can manage schedules" ON schedules;
DROP POLICY IF EXISTS "user_view_schedules" ON schedules;
DROP POLICY IF EXISTS "admin_manage_schedules" ON schedules;
DROP POLICY IF EXISTS "Users can view schedules in their organization" ON schedules;
DROP POLICY IF EXISTS "Users can create schedules in their organization" ON schedules;
DROP POLICY IF EXISTS "Users can update schedules they created or have access to" ON schedules;
DROP POLICY IF EXISTS "Users can delete schedules they created or have admin access" ON schedules;
DROP POLICY IF EXISTS "Admins and managers can manage schedules" ON schedules;

-- Step 2: Ensure helper functions exist
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organization_id 
        FROM user_profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_has_org_access(target_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() 
            AND organization_id = target_org_id
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create comprehensive RLS policies for schedules table
-- Enable RLS on schedules table
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- Policy for viewing schedules: Users can view schedules in their organization
CREATE POLICY "schedules_select_policy" ON schedules
    FOR SELECT
    USING (
        -- User belongs to the same organization as the schedule
        organization_id = get_user_organization_id()
    );

-- Policy for inserting schedules: Users can create schedules in their organization  
CREATE POLICY "schedules_insert_policy" ON schedules
    FOR INSERT
    WITH CHECK (
        -- Schedule must be created for user's own organization
        organization_id = get_user_organization_id()
        AND 
        -- User must be authenticated
        auth.uid() IS NOT NULL
    );

-- Policy for updating schedules: Users can update schedules in their organization
CREATE POLICY "schedules_update_policy" ON schedules
    FOR UPDATE
    USING (
        -- Can update schedules in their organization
        organization_id = get_user_organization_id()
    )
    WITH CHECK (
        -- Updated schedule must still belong to their organization
        organization_id = get_user_organization_id()
    );

-- Policy for deleting schedules: Users can delete schedules they created or admins can delete any in org
CREATE POLICY "schedules_delete_policy" ON schedules
    FOR DELETE
    USING (
        organization_id = get_user_organization_id()
        AND (
            -- User created this schedule
            created_by = auth.uid()
            OR
            -- User is admin/super_admin
            EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE id = auth.uid() 
                AND role IN ('super_admin', 'admin')
                AND organization_id = schedules.organization_id
            )
        )
    );

-- Step 4: Also fix screen_schedules table RLS if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'screen_schedules') THEN
        -- Remove existing policies
        DROP POLICY IF EXISTS "Users can view screen schedules for their organization" ON screen_schedules;
        DROP POLICY IF EXISTS "Users can manage screen schedules" ON screen_schedules;
        
        -- Enable RLS
        ALTER TABLE screen_schedules ENABLE ROW LEVEL SECURITY;
        
        -- Allow users to view screen_schedules for schedules in their org
        CREATE POLICY "screen_schedules_select_policy" ON screen_schedules
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM schedules 
                    WHERE schedules.id = screen_schedules.schedule_id
                    AND schedules.organization_id = get_user_organization_id()
                )
            );
            
        -- Allow users to manage screen_schedules for schedules in their org
        CREATE POLICY "screen_schedules_insert_policy" ON screen_schedules
            FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM schedules 
                    WHERE schedules.id = screen_schedules.schedule_id
                    AND schedules.organization_id = get_user_organization_id()
                )
            );
            
        CREATE POLICY "screen_schedules_update_policy" ON screen_schedules
            FOR UPDATE
            USING (
                EXISTS (
                    SELECT 1 FROM schedules 
                    WHERE schedules.id = screen_schedules.schedule_id
                    AND schedules.organization_id = get_user_organization_id()
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM schedules 
                    WHERE schedules.id = screen_schedules.schedule_id
                    AND schedules.organization_id = get_user_organization_id()
                )
            );
            
        CREATE POLICY "screen_schedules_delete_policy" ON screen_schedules
            FOR DELETE
            USING (
                EXISTS (
                    SELECT 1 FROM schedules 
                    WHERE schedules.id = screen_schedules.schedule_id
                    AND schedules.organization_id = get_user_organization_id()
                )
            );
    END IF;
END $$;

COMMIT;

-- Test the policies
SELECT 'RLS policies updated successfully' as status;