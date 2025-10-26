-- ==========================================
-- FIX TECH ROLE SCHEDULES POLICIES
-- ==========================================
-- The schedules table has organization_id, so we can use it directly
-- This is simpler and more aligned with the existing super_admin policies
-- ==========================================

-- Drop the existing tech schedules policies
DROP POLICY IF EXISTS "Tech users can view all schedules in organization" ON schedules;
DROP POLICY IF EXISTS "Tech users can create schedules" ON schedules;
DROP POLICY IF EXISTS "Tech users can update schedules" ON schedules;
DROP POLICY IF EXISTS "Tech users can delete schedules" ON schedules;

-- Recreate with organization_id check (much simpler and more performant)
CREATE POLICY "Tech users can view all schedules in organization" ON schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = schedules.organization_id
        )
    );

CREATE POLICY "Tech users can create schedules" ON schedules
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = schedules.organization_id
        )
    );

CREATE POLICY "Tech users can update schedules" ON schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = schedules.organization_id
        )
    );

CREATE POLICY "Tech users can delete schedules" ON schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = schedules.organization_id
        )
    );

-- Verify policies were created
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'schedules'
AND policyname LIKE '%Tech%'
ORDER BY policyname;
