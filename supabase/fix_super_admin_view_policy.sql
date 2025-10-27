-- ==========================================
-- FIX SUPER ADMIN VIEW POLICY
-- ==========================================
-- Purpose: Allow super admins to view all users in their organization
--          without causing infinite recursion
--
-- Solution: Use SECURITY DEFINER functions to bypass RLS when checking
--           the current user's role and organization
-- ==========================================

-- Drop any existing problematic policy
DROP POLICY IF EXISTS "Super admins can view organization users" ON user_profiles;

-- Create a function that checks if the current user is a super admin
-- SECURITY DEFINER allows this function to bypass RLS
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create a function to get the user's organization_id
-- SECURITY DEFINER allows this function to bypass RLS
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
BEGIN
    RETURN (
        SELECT organization_id FROM user_profiles
        WHERE id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create the policy using the functions (which bypass RLS with SECURITY DEFINER)
CREATE POLICY "Super admins can view organization users" ON user_profiles
    FOR SELECT USING (
        is_super_admin() AND organization_id = get_user_org_id()
    );

-- Verification
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'user_profiles'
AND policyname = 'Super admins can view organization users';
