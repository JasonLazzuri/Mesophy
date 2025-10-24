-- Fix final remaining Function Search Path Mutable warnings
-- Handle the last batch of functions that need search_path set

-- 1. Fix cleanup_old_notifications function
DROP FUNCTION IF EXISTS public.cleanup_old_notifications() CASCADE;
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Delete notifications older than 30 days
    DELETE FROM device_notification_log 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- 2. Fix notify_schedule_change function
DROP FUNCTION IF EXISTS public.notify_schedule_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert notification for schedule changes
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    VALUES (
        COALESCE(NEW.screen_id, OLD.screen_id),
        'schedule_updated',
        jsonb_build_object(
            'schedule_id', COALESCE(NEW.id, OLD.id),
            'action', TG_OP,
            'timestamp', NOW()
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Fix create_user_with_profile function
DROP FUNCTION IF EXISTS public.create_user_with_profile(text, text, text, text, uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_user_with_profile(
    p_email text,
    p_full_name text,
    p_role text,
    p_password text DEFAULT NULL,
    p_organization_id uuid DEFAULT NULL,
    p_district_id uuid DEFAULT NULL,
    p_location_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
BEGIN
    -- Generate a new UUID for the user
    new_user_id := gen_random_uuid();
    
    -- Create user profile (user creation in auth.users happens through Supabase Auth)
    INSERT INTO user_profiles (
        id, 
        email, 
        full_name, 
        role, 
        organization_id, 
        district_id, 
        location_id
    )
    VALUES (
        new_user_id,
        p_email,
        p_full_name,
        p_role::user_role,
        p_organization_id,
        p_district_id,
        p_location_id
    );
    
    RETURN new_user_id;
END;
$$;

-- 4. Fix get_pending_commands function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.get_pending_commands() CASCADE;
CREATE OR REPLACE FUNCTION public.get_pending_commands()
RETURNS TABLE(
    id uuid,
    screen_id uuid,
    command_type text,
    command_data jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.screen_id,
        dc.command_type,
        dc.command_data,
        dc.created_at
    FROM device_commands dc
    WHERE dc.status = 'pending'
    ORDER BY dc.created_at ASC;
END;
$$;

-- 5. Fix get_device_alert_summary function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.get_device_alert_summary() CASCADE;
CREATE OR REPLACE FUNCTION public.get_device_alert_summary()
RETURNS TABLE(
    organization_name text,
    total_alerts integer,
    critical_alerts integer,
    warning_alerts integer,
    info_alerts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.name as organization_name,
        COUNT(*)::integer as total_alerts,
        COUNT(CASE WHEN da.severity = 'critical' THEN 1 END)::integer as critical_alerts,
        COUNT(CASE WHEN da.severity = 'warning' THEN 1 END)::integer as warning_alerts,
        COUNT(CASE WHEN da.severity = 'info' THEN 1 END)::integer as info_alerts
    FROM device_alerts da
    JOIN screens s ON da.screen_id = s.id
    JOIN locations l ON s.location_id = l.id
    JOIN districts d ON l.district_id = d.id
    JOIN organizations o ON d.organization_id = o.id
    WHERE da.status = 'active'
    GROUP BY o.name
    ORDER BY critical_alerts DESC, total_alerts DESC;
END;
$$;

-- 6. Fix setup_admin_profile function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.setup_admin_profile(text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.setup_admin_profile(
    p_email text,
    p_full_name text,
    p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update existing user profile to admin
    UPDATE user_profiles 
    SET 
        role = 'super_admin',
        organization_id = p_organization_id,
        updated_at = NOW()
    WHERE email = p_email;
    
    -- If no user found, this might be called after user creation
    IF NOT FOUND THEN
        RAISE NOTICE 'No user profile found for email: %', p_email;
    END IF;
END;
$$;

-- 7. Fix log_content_change function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.log_content_change(text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.log_content_change(
    p_table_name text,
    p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log content changes for all active screens
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT 
        s.id,
        'content_updated',
        jsonb_build_object(
            'table', p_table_name,
            'action', p_action,
            'timestamp', NOW()
        )
    FROM screens s
    WHERE s.is_active = true;
END;
$$;

-- 8. Fix check_schedule_conflicts function (another overloaded version)
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, timestamptz, timestamptz) CASCADE;
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
    p_schedule_id uuid,
    p_screen_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM schedules s
        WHERE s.screen_id = p_screen_id
        AND s.id != p_schedule_id
        AND s.is_active = true
        AND (
            (s.start_time <= p_start_time AND s.end_time > p_start_time)
            OR (s.start_time < p_end_time AND s.end_time >= p_end_time)
            OR (s.start_time >= p_start_time AND s.end_time <= p_end_time)
        )
    );
END;
$$;

-- 9. Fix create_fresh_admin_user function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.create_fresh_admin_user(text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_fresh_admin_user(
    p_email text,
    p_full_name text,
    p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
BEGIN
    -- Generate new user ID
    new_user_id := gen_random_uuid();
    
    -- Create admin user profile
    INSERT INTO user_profiles (
        id, 
        email, 
        full_name, 
        role, 
        organization_id
    )
    VALUES (
        new_user_id,
        p_email,
        p_full_name,
        'super_admin',
        p_organization_id
    );
    
    RETURN new_user_id;
END;
$$;

-- 10. Fix get_user_organization_id function (if there's an overloaded version)
DROP FUNCTION IF EXISTS public.get_user_organization_id() CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id
    FROM user_profiles
    WHERE id = auth.uid();
    
    RETURN org_id;
END;
$$;

-- 11. Fix user_has_org_access function (if there's an overloaded version)  
DROP FUNCTION IF EXISTS public.user_has_org_access(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.user_has_org_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE id = auth.uid()
        AND organization_id = p_organization_id
        AND is_active = true
    );
END;
$$;

-- Recreate any triggers that might have been dropped
DO $$
BEGIN
    -- Recreate schedule change trigger if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'schedules_notify_change'
    ) THEN
        CREATE TRIGGER schedules_notify_change
            AFTER INSERT OR UPDATE OR DELETE ON schedules
            FOR EACH ROW
            EXECUTE FUNCTION notify_schedule_change();
    END IF;
END $$;

-- Grant necessary permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final verification of all functions
SELECT 
    proname as function_name,
    CASE 
        WHEN 'search_path=public' = ANY(proconfig) THEN 'SECURE'
        ELSE 'NEEDS_FIX'
    END as security_status
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname LIKE ANY(ARRAY[
    'cleanup%',
    'notify%', 
    'create%',
    'get%',
    'setup%',
    'log%',
    'check%',
    'user%'
])
ORDER BY 
    CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 ELSE 0 END,
    proname;