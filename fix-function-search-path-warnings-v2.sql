-- Fix Function Search Path Mutable warnings (Version 2)
-- Handle dependencies properly by dropping triggers first

-- Step 1: Drop triggers that depend on functions we need to recreate
DROP TRIGGER IF EXISTS trigger_update_device_commands_updated_at ON device_commands;
DROP TRIGGER IF EXISTS playlist_items_notify_change ON playlist_items;
DROP TRIGGER IF EXISTS media_assets_notify_change ON media_assets;
DROP TRIGGER IF EXISTS playlists_notify_change ON playlists;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- Step 2: Now safely drop and recreate functions with proper search_path

-- 1. Fix cleanup_expired_notifications function
DROP FUNCTION IF EXISTS public.cleanup_expired_notifications();
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Delete notifications older than 7 days
    DELETE FROM device_notification_log 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- 2. Fix cleanup_expired_pairing_codes function
DROP FUNCTION IF EXISTS public.cleanup_expired_pairing_codes();
CREATE OR REPLACE FUNCTION public.cleanup_expired_pairing_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Delete pairing codes older than 1 hour
    DELETE FROM device_pairing_codes 
    WHERE created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- 3. Fix resolve_old_alerts function
DROP FUNCTION IF EXISTS public.resolve_old_alerts();
CREATE OR REPLACE FUNCTION public.resolve_old_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_count integer;
BEGIN
    -- Resolve alerts older than 24 hours
    UPDATE device_alerts 
    SET status = 'resolved', 
        resolved_at = NOW() 
    WHERE status = 'active' 
    AND created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RETURN updated_count;
END;
$$;

-- 4. Fix get_pending_commands function
DROP FUNCTION IF EXISTS public.get_pending_commands(uuid);
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

-- 5. Fix update_device_commands_updated_at function (used by trigger)
DROP FUNCTION IF EXISTS public.update_device_commands_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_device_commands_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 6. Fix check_schedule_conflicts_by_screen_type function
DROP FUNCTION IF EXISTS public.check_schedule_conflicts_by_screen_type(uuid, text, timestamptz, timestamptz, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_by_screen_type(
    p_location_id uuid,
    p_screen_type text,
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
        JOIN screens sc ON s.screen_id = sc.id
        WHERE sc.location_id = p_location_id
        AND sc.screen_type::text = p_screen_type
        AND s.id != COALESCE(p_exclude_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND (
            (s.start_time <= p_start_time AND s.end_time > p_start_time)
            OR (s.start_time < p_end_time AND s.end_time >= p_end_time)
            OR (s.start_time >= p_start_time AND s.end_time <= p_end_time)
        )
    );
END;
$$;

-- 7. Fix notify_playlist_items_change function (used by trigger)
DROP FUNCTION IF EXISTS public.notify_playlist_items_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_playlist_items_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert notification for playlist change
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'playlist_updated', jsonb_build_object(
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

-- 8. Fix get_device_alert_summary function
DROP FUNCTION IF EXISTS public.get_device_alert_summary(uuid) CASCADE;
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

-- 9. Fix handle_new_user function (used by trigger)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$;

-- 10. Fix setup_admin_profile function
DROP FUNCTION IF EXISTS public.setup_admin_profile(uuid, text, text, uuid) CASCADE;
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

-- 11. Fix notify_media_change function (used by trigger)
DROP FUNCTION IF EXISTS public.notify_media_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_media_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert notification for media change
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'media_updated', jsonb_build_object(
        'media_id', COALESCE(NEW.id, OLD.id),
        'action', TG_OP,
        'timestamp', NOW()
    )
    FROM screens s
    JOIN schedules sch ON s.id = sch.screen_id
    JOIN playlist_items pi ON sch.playlist_id = pi.playlist_id
    WHERE pi.media_asset_id = COALESCE(NEW.id, OLD.id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 12. Fix generate_pairing_code function
DROP FUNCTION IF EXISTS public.generate_pairing_code() CASCADE;
CREATE OR REPLACE FUNCTION public.generate_pairing_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- 13. Fix generate_device_token function
DROP FUNCTION IF EXISTS public.generate_device_token() CASCADE;
CREATE OR REPLACE FUNCTION public.generate_device_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..64 LOOP
        result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- 14. Fix notify_playlist_change function (used by trigger)
DROP FUNCTION IF EXISTS public.notify_playlist_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_playlist_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert notification for playlist change
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'playlist_updated', jsonb_build_object(
        'playlist_id', COALESCE(NEW.id, OLD.id),
        'action', TG_OP,
        'timestamp', NOW()
    )
    FROM screens s
    JOIN schedules sch ON s.id = sch.screen_id
    WHERE sch.playlist_id = COALESCE(NEW.id, OLD.id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 3: Recreate the triggers that were dropped
CREATE TRIGGER trigger_update_device_commands_updated_at
    BEFORE UPDATE ON device_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_device_commands_updated_at();

CREATE TRIGGER playlist_items_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW
    EXECUTE FUNCTION notify_playlist_items_change();

CREATE TRIGGER media_assets_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON media_assets
    FOR EACH ROW
    EXECUTE FUNCTION notify_media_change();

CREATE TRIGGER playlists_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlists
    FOR EACH ROW
    EXECUTE FUNCTION notify_playlist_change();

-- Only recreate the auth trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'handle_new_user_trigger'
    ) THEN
        CREATE TRIGGER handle_new_user_trigger
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- Grant necessary permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Verify functions are secure
SELECT 
    proname as function_name,
    prosecdef as security_definer,
    CASE 
        WHEN 'search_path=public' = ANY(proconfig) THEN 'YES'
        ELSE 'NO'
    END as search_path_set
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'cleanup_expired_notifications',
    'cleanup_expired_pairing_codes', 
    'resolve_old_alerts',
    'get_pending_commands',
    'update_device_commands_updated_at',
    'check_schedule_conflicts_by_screen_type',
    'notify_playlist_items_change',
    'get_device_alert_summary',
    'handle_new_user',
    'setup_admin_profile',
    'notify_media_change',
    'generate_pairing_code',
    'generate_device_token',
    'notify_playlist_change'
)
ORDER BY proname;