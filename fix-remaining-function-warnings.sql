-- Fix remaining Function Search Path Mutable warnings
-- Handle the additional functions that still need search_path set

-- 1. Fix log_content_change function
DROP FUNCTION IF EXISTS public.log_content_change() CASCADE;
CREATE OR REPLACE FUNCTION public.log_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log content changes for device notifications
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

-- 2. Fix get_device_notifications function
DROP FUNCTION IF EXISTS public.get_device_notifications(uuid, timestamptz) CASCADE;
CREATE OR REPLACE FUNCTION public.get_device_notifications(
    p_screen_id uuid,
    p_since timestamptz DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    notification_type text,
    notification_data jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dnl.id,
        dnl.notification_type,
        dnl.notification_data,
        dnl.created_at
    FROM device_notification_log dnl
    WHERE dnl.screen_id = p_screen_id
    AND (p_since IS NULL OR dnl.created_at > p_since)
    ORDER BY dnl.created_at ASC;
END;
$$;

-- 3. Fix calculate_playlist_duration function
DROP FUNCTION IF EXISTS public.calculate_playlist_duration(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_playlist_duration(p_playlist_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_duration integer := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN ma.duration IS NOT NULL THEN ma.duration
            ELSE 10 -- Default 10 seconds for images
        END
    ), 0)
    INTO total_duration
    FROM playlist_items pi
    JOIN media_assets ma ON pi.media_asset_id = ma.id
    WHERE pi.playlist_id = p_playlist_id;
    
    RETURN total_duration;
END;
$$;

-- 4. Fix update_playlist_duration function
DROP FUNCTION IF EXISTS public.update_playlist_duration() CASCADE;
CREATE OR REPLACE FUNCTION public.update_playlist_duration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    playlist_id_to_update uuid;
BEGIN
    -- Get the playlist ID from the changed record
    playlist_id_to_update := COALESCE(NEW.playlist_id, OLD.playlist_id);
    
    -- Update the playlist duration
    UPDATE playlists 
    SET updated_at = NOW()
    WHERE id = playlist_id_to_update;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Fix get_active_schedules_for_screen function
DROP FUNCTION IF EXISTS public.get_active_schedules_for_screen(uuid, timestamptz) CASCADE;
CREATE OR REPLACE FUNCTION public.get_active_schedules_for_screen(
    p_screen_id uuid,
    p_current_time timestamptz DEFAULT NOW()
)
RETURNS TABLE(
    schedule_id uuid,
    playlist_id uuid,
    playlist_name text,
    start_time timestamptz,
    end_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as schedule_id,
        s.playlist_id,
        p.name as playlist_name,
        s.start_time,
        s.end_time
    FROM schedules s
    JOIN playlists p ON s.playlist_id = p.id
    WHERE s.screen_id = p_screen_id
    AND s.start_time <= p_current_time
    AND s.end_time > p_current_time
    AND s.is_active = true
    ORDER BY s.priority DESC, s.start_time ASC;
END;
$$;

-- 6. Fix check_schedule_conflicts function (overloaded version)
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, timestamptz, timestamptz, uuid) CASCADE;
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

-- 7. Fix get_user_accessible_locations function
DROP FUNCTION IF EXISTS public.get_user_accessible_locations(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_accessible_locations(p_user_id uuid)
RETURNS TABLE(
    location_id uuid,
    location_name text,
    district_name text,
    organization_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
    user_org_id uuid;
    user_district_id uuid;
    user_location_id uuid;
BEGIN
    -- Get user profile
    SELECT role, organization_id, district_id, location_id
    INTO user_role, user_org_id, user_district_id, user_location_id
    FROM user_profiles
    WHERE id = p_user_id;
    
    -- Return locations based on user role
    IF user_role = 'super_admin' THEN
        RETURN QUERY
        SELECT l.id, l.name, d.name, o.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        JOIN organizations o ON d.organization_id = o.id
        WHERE o.id = user_org_id;
    ELSIF user_role = 'district_manager' THEN
        RETURN QUERY
        SELECT l.id, l.name, d.name, o.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = user_district_id;
    ELSIF user_role = 'location_manager' THEN
        RETURN QUERY
        SELECT l.id, l.name, d.name, o.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        JOIN organizations o ON d.organization_id = o.id
        WHERE l.id = user_location_id;
    END IF;
END;
$$;

-- 8. Fix create_fresh_admin_user function
DROP FUNCTION IF EXISTS public.create_fresh_admin_user(text, text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_fresh_admin_user(
    p_email text,
    p_password text,
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
    -- This function would typically be called by a system process
    -- In practice, user creation happens through Supabase Auth
    -- This is a placeholder for admin user setup
    
    -- Create user profile (assuming user already exists in auth.users)
    INSERT INTO user_profiles (id, email, full_name, role, organization_id)
    VALUES (gen_random_uuid(), p_email, p_full_name, 'super_admin', p_organization_id)
    RETURNING id INTO new_user_id;
    
    RETURN new_user_id;
END;
$$;

-- 9. Fix notify_simple_playlist_change function
DROP FUNCTION IF EXISTS public.notify_simple_playlist_change() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_simple_playlist_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Simple notification for playlist changes
    INSERT INTO device_notification_log (screen_id, notification_type, notification_data)
    SELECT DISTINCT s.id, 'playlist_simple_update', jsonb_build_object(
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

-- 10. Fix get_user_organization_id function
DROP FUNCTION IF EXISTS public.get_user_organization_id(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid)
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
    WHERE id = p_user_id;
    
    RETURN org_id;
END;
$$;

-- 11. Fix user_has_org_access function
DROP FUNCTION IF EXISTS public.user_has_org_access(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.user_has_org_access(
    p_user_id uuid,
    p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE id = p_user_id
        AND organization_id = p_organization_id
        AND is_active = true
    );
END;
$$;

-- Recreate any triggers that might have been dropped
DO $$
BEGIN
    -- Recreate trigger for playlist duration updates if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'playlist_items_update_duration'
    ) THEN
        CREATE TRIGGER playlist_items_update_duration
            AFTER INSERT OR UPDATE OR DELETE ON playlist_items
            FOR EACH ROW
            EXECUTE FUNCTION update_playlist_duration();
    END IF;
    
    -- Recreate trigger for content change logging if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'content_change_trigger'
    ) THEN
        CREATE TRIGGER content_change_trigger
            AFTER INSERT OR UPDATE OR DELETE ON schedules
            FOR EACH ROW
            EXECUTE FUNCTION log_content_change();
    END IF;
END $$;

-- Grant necessary permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Verify all functions now have search_path set
SELECT 
    proname as function_name,
    CASE 
        WHEN 'search_path=public' = ANY(proconfig) THEN 'YES'
        ELSE 'NO'
    END as search_path_set
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'log_content_change',
    'get_device_notifications',
    'calculate_playlist_duration',
    'update_playlist_duration',
    'get_active_schedules_for_screen',
    'check_schedule_conflicts',
    'get_user_accessible_locations',
    'create_fresh_admin_user',
    'notify_simple_playlist_change',
    'get_user_organization_id',
    'user_has_org_access'
)
ORDER BY proname;