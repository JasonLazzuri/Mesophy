-- Fix the remaining NEEDS_FIX functions from the verification query
-- Target the specific functions that still show as insecure

-- First, let's see what overloaded versions exist and fix them systematically

-- 1. Fix all versions of check_schedule_conflicts functions
-- Drop all versions first to avoid conflicts
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, timestamptz, timestamptz, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, timestamptz, timestamptz, uuid) CASCADE;

-- Recreate the main version used by the application
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
    p_screen_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL
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
        AND s.id != COALESCE(p_exclude_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND s.is_active = true
        AND (
            (s.start_time <= p_start_time AND s.end_time > p_start_time)
            OR (s.start_time < p_end_time AND s.end_time >= p_end_time)
            OR (s.start_time >= p_start_time AND s.end_time <= p_end_time)
        )
    );
END;
$$;

-- 2. Fix all versions of create_fresh_admin_user
DROP FUNCTION IF EXISTS public.create_fresh_admin_user(text, text, text, uuid) CASCADE;
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
    new_user_id := gen_random_uuid();
    
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

-- 3. Fix all versions of create_user_with_profile
DROP FUNCTION IF EXISTS public.create_user_with_profile(text, text, text, text, uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_user_with_profile(text, text, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.create_user_with_profile(
    p_email text,
    p_full_name text,
    p_role text,
    p_organization_id uuid,
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
    new_user_id := gen_random_uuid();
    
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

-- 4. Fix all versions of get_device_alert_summary
DROP FUNCTION IF EXISTS public.get_device_alert_summary(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_device_alert_summary() CASCADE;

CREATE OR REPLACE FUNCTION public.get_device_alert_summary(p_organization_id uuid)
RETURNS TABLE(
    location_name text,
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
        l.name as location_name,
        COUNT(*)::integer as total_alerts,
        COUNT(CASE WHEN da.severity = 'critical' THEN 1 END)::integer as critical_alerts,
        COUNT(CASE WHEN da.severity = 'warning' THEN 1 END)::integer as warning_alerts,
        COUNT(CASE WHEN da.severity = 'info' THEN 1 END)::integer as info_alerts
    FROM device_alerts da
    JOIN screens s ON da.screen_id = s.id
    JOIN locations l ON s.location_id = l.id
    JOIN districts d ON l.district_id = d.id
    WHERE d.organization_id = p_organization_id
    AND da.status = 'active'
    GROUP BY l.name
    ORDER BY critical_alerts DESC, total_alerts DESC;
END;
$$;

-- 5. Fix all versions of get_pending_commands
DROP FUNCTION IF EXISTS public.get_pending_commands(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_commands() CASCADE;

CREATE OR REPLACE FUNCTION public.get_pending_commands(p_screen_id uuid)
RETURNS TABLE(
    id uuid,
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
        dc.command_type,
        dc.command_data,
        dc.created_at
    FROM device_commands dc
    WHERE dc.screen_id = p_screen_id
    AND dc.status = 'pending'
    ORDER BY dc.created_at ASC;
END;
$$;

-- 6. Fix get_screen_types function
DROP FUNCTION IF EXISTS public.get_screen_types() CASCADE;
CREATE OR REPLACE FUNCTION public.get_screen_types()
RETURNS TABLE(screen_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT s.screen_type::text
    FROM screens s
    ORDER BY s.screen_type::text;
END;
$$;

-- 7. Fix all versions of log_content_change
DROP FUNCTION IF EXISTS public.log_content_change() CASCADE;
DROP FUNCTION IF EXISTS public.log_content_change(text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.log_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'content_updated', jsonb_build_object(
        'table', TG_TABLE_NAME,
        'action', TG_OP,
        'timestamp', NOW()
    )
    FROM screens s
    WHERE s.location_id IS NOT NULL;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 8. Fix notify_simple_playlist_items_change function
DROP FUNCTION IF EXISTS public.notify_simple_playlist_items_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_simple_playlist_items_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'playlist_items_updated', jsonb_build_object(
        'playlist_id', COALESCE(NEW.playlist_id, OLD.playlist_id),
        'action', TG_OP,
        'timestamp', NOW()
    )
    FROM screens s
    JOIN schedules sch ON s.id = sch.screen_id
    WHERE sch.playlist_id = COALESCE(NEW.playlist_id, OLD.playlist_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 9. Fix all versions of setup_admin_profile
DROP FUNCTION IF EXISTS public.setup_admin_profile(uuid, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.setup_admin_profile(text, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.setup_admin_profile(
    p_user_id uuid,
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
    INSERT INTO user_profiles (id, email, full_name, role, organization_id)
    VALUES (p_user_id, p_email, p_full_name, 'super_admin', p_organization_id)
    ON CONFLICT (id) DO UPDATE SET
        role = 'super_admin',
        organization_id = p_organization_id,
        updated_at = NOW();
END;
$$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final comprehensive verification
SELECT 
    proname as function_name,
    CASE 
        WHEN 'search_path=public' = ANY(proconfig) THEN '✅ SECURE'
        ELSE '❌ NEEDS_FIX'
    END as security_status,
    oidvectortypes(proargtypes) as parameters
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'check_schedule_conflicts',
    'create_fresh_admin_user', 
    'create_user_with_profile',
    'get_device_alert_summary',
    'get_pending_commands',
    'get_screen_types',
    'log_content_change',
    'notify_simple_playlist_items_change',
    'setup_admin_profile'
)
ORDER BY 
    CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 ELSE 0 END,
    proname,
    oidvectortypes(proargtypes);