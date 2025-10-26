-- ==========================================
-- ADD TECH USER VIEW POLICY FOR USER_PROFILES
-- ==========================================
-- Purpose: Allow tech users to view other users in their organization
--          (read-only access as per requirements)
-- ==========================================

CREATE POLICY "Tech users can view organization users" ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles tech_profile
            WHERE tech_profile.id = auth.uid()
            AND tech_profile.role = 'tech'
            AND tech_profile.organization_id = user_profiles.organization_id
        )
    );

-- Verification query
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_profiles'
AND policyname LIKE '%tech%'
ORDER BY policyname;
