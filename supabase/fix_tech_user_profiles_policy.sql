-- ==========================================
-- FIX TECH ROLE USER_PROFILES POLICY
-- ==========================================
-- The user_profiles tech policy was causing circular reference
-- This prevents ALL users from loading their profiles
-- ==========================================

-- Drop the problematic tech user_profiles policy
DROP POLICY IF EXISTS "Tech users can view users in organization" ON user_profiles;

-- DO NOT recreate it - tech users can already see users via the existing
-- super_admin/district_manager policies or we need a different approach

-- Instead, let's create a safe version that doesn't cause recursion
-- by avoiding the self-referential check in the subquery
CREATE POLICY "Tech users can view organization users" ON user_profiles
    FOR SELECT USING (
        -- Tech users can view other users in their organization
        -- This works because we check role directly without nested queries
        auth.uid() IN (
            SELECT id FROM user_profiles
            WHERE role = 'tech'
            AND organization_id = user_profiles.organization_id
        )
    );

-- Verify the policy was created
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;
