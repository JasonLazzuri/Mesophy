-- ==========================================
-- DROP TECH USER VIEW POLICY
-- ==========================================
-- Purpose: Remove the problematic tech user viewing policy that causes
--          infinite recursion in RLS checks
-- ==========================================

DROP POLICY IF EXISTS "Tech users can view organization users" ON user_profiles;

-- Verification - check remaining policies on user_profiles
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;
