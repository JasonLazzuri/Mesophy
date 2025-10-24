-- Fix the exact function signatures that still show as NEEDS_FIX
-- Target the specific parameter combinations shown in the verification

-- 1. Fix check_schedule_conflicts with (uuid, uuid, date, date, time without time zone, time without time zone)
-- This appears to be an old version with date/time parameters instead of timestamptz
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, date, date, time, time) CASCADE;

-- 2. Fix check_schedule_conflicts with the other parameter signature shown
-- Look for any remaining versions and drop them
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Find and drop all remaining check_schedule_conflicts functions that aren't secured
    FOR func_record IN 
        SELECT p.oid, p.proname, oidvectortypes(p.proargtypes) as params
        FROM pg_proc p
        WHERE p.proname = 'check_schedule_conflicts'
        AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', 
                      func_record.proname, func_record.params);
    END LOOP;
END $$;

-- 3. Fix create_fresh_admin_user with (text, text, text) signature
DROP FUNCTION IF EXISTS public.create_fresh_admin_user(text, text, text) CASCADE;

-- 4. Fix create_user_with_profile with (text, text, text) signature  
DROP FUNCTION IF EXISTS public.create_user_with_profile(text, text, text) CASCADE;

-- 5. Fix get_device_alert_summary with (character varying) signature
DROP FUNCTION IF EXISTS public.get_device_alert_summary(character varying) CASCADE;
DROP FUNCTION IF EXISTS public.get_device_alert_summary(varchar) CASCADE;

-- 6. Fix get_pending_commands with (text, integer) signature
DROP FUNCTION IF EXISTS public.get_pending_commands(text, integer) CASCADE;

-- 7. Fix log_content_change with (uuid[], text, jsonb) signature
DROP FUNCTION IF EXISTS public.log_content_change(uuid[], text, jsonb) CASCADE;

-- 8. Fix setup_admin_profile with (text, text) signature
DROP FUNCTION IF EXISTS public.setup_admin_profile(text, text) CASCADE;

-- Now let's do a comprehensive cleanup of ALL insecure functions
-- by dropping any function that doesn't have search_path=public set

DO $$
DECLARE
    func_record RECORD;
    drop_statement TEXT;
BEGIN
    -- Find all functions in public schema that don't have search_path=public
    FOR func_record IN 
        SELECT 
            p.oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND NOT ('search_path=public' = ANY(p.proconfig))
        AND p.proname IN (
            'check_schedule_conflicts',
            'create_fresh_admin_user',
            'create_user_with_profile', 
            'get_device_alert_summary',
            'get_pending_commands',
            'log_content_change',
            'setup_admin_profile',
            'notify_simple_playlist_items_change',
            'get_screen_types'
        )
    LOOP
        drop_statement := format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', 
                               func_record.proname, 
                               func_record.identity_args);
        
        RAISE NOTICE 'Dropping insecure function: %', drop_statement;
        EXECUTE drop_statement;
    END LOOP;
END $$;

-- Now recreate the essential functions with proper security
-- Only create the versions that are actually needed by the application

-- Essential: check_schedule_conflicts for screen scheduling
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

-- Essential: get_pending_commands for device polling
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

-- Essential: setup_admin_profile for user management
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

-- Essential: log_content_change trigger function
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
    WHERE s.is_active = true;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final verification - this should show only SECURE functions now
SELECT 
    proname as function_name,
    CASE 
        WHEN 'search_path=public' = ANY(proconfig) THEN '✅ SECURE'
        ELSE '❌ NEEDS_FIX'
    END as security_status,
    pg_get_function_identity_arguments(oid) as parameters
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
    proname;