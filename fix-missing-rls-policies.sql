-- Fix missing RLS policies for polling system tables
-- These tables were flagged by Supabase Security Advisor

-- 1. Enable RLS on polling_configurations table
ALTER TABLE public.polling_configurations ENABLE ROW LEVEL SECURITY;

-- RLS policies for polling_configurations
-- Only super admins can read/write polling configurations for their organization
CREATE POLICY "Super admins can manage polling configs for their org" ON public.polling_configurations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = auth.uid() 
            AND up.role = 'super_admin' 
            AND up.organization_id = polling_configurations.organization_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = auth.uid() 
            AND up.role = 'super_admin' 
            AND up.organization_id = polling_configurations.organization_id
        )
    );

-- 2. Enable RLS on device_commands table
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

-- RLS policies for device_commands
-- Users can manage device commands for devices in their scope
CREATE POLICY "Users can manage device commands in their scope" ON public.device_commands
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_commands.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND (
                (up.role = 'super_admin' AND up.organization_id = d.organization_id)
                OR (up.role = 'district_manager' AND up.district_id = d.id)
                OR (up.role = 'location_manager' AND up.location_id = l.id)
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_commands.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND (
                (up.role = 'super_admin' AND up.organization_id = d.organization_id)
                OR (up.role = 'district_manager' AND up.district_id = d.id)
                OR (up.role = 'location_manager' AND up.location_id = l.id)
            )
        )
    );

-- 3. Enable RLS on device_notification_log table
ALTER TABLE public.device_notification_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for device_notification_log
-- Users can read notification logs for devices in their scope
-- System can write to any device notification log (for triggers)
CREATE POLICY "Users can read device notifications in their scope" ON public.device_notification_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_notification_log.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND (
                (up.role = 'super_admin' AND up.organization_id = d.organization_id)
                OR (up.role = 'district_manager' AND up.district_id = d.id)
                OR (up.role = 'location_manager' AND up.location_id = l.id)
            )
        )
    );

-- Allow system to insert notification logs (for database triggers)
-- This policy allows inserts without user authentication for system operations
CREATE POLICY "System can insert device notifications" ON public.device_notification_log
    FOR INSERT
    WITH CHECK (true);

-- Allow users to update notification logs for devices in their scope (mark as read, etc.)
CREATE POLICY "Users can update device notifications in their scope" ON public.device_notification_log
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_notification_log.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND (
                (up.role = 'super_admin' AND up.organization_id = d.organization_id)
                OR (up.role = 'district_manager' AND up.district_id = d.id)
                OR (up.role = 'location_manager' AND up.location_id = l.id)
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_notification_log.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND (
                (up.role = 'super_admin' AND up.organization_id = d.organization_id)
                OR (up.role = 'district_manager' AND up.district_id = d.id)
                OR (up.role = 'location_manager' AND up.location_id = l.id)
            )
        )
    );

-- Allow super admins to delete old notification logs for cleanup
CREATE POLICY "Super admins can delete device notifications" ON public.device_notification_log
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN screens s ON s.id = device_notification_log.screen_id
            JOIN locations l ON l.id = s.location_id
            JOIN districts d ON d.id = l.district_id
            WHERE up.id = auth.uid()
            AND up.role = 'super_admin' 
            AND up.organization_id = d.organization_id
        )
    );

-- Verify RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('polling_configurations', 'device_commands', 'device_notification_log')
ORDER BY tablename;

-- Show the policies created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('polling_configurations', 'device_commands', 'device_notification_log')
ORDER BY tablename, policyname;