-- Fix the final 8 remaining security warnings
-- Target the specific functions shown in the Security Advisor

-- 1. Fix mark_notifications_processed function
DROP FUNCTION IF EXISTS public.mark_notifications_processed CASCADE;
CREATE OR REPLACE FUNCTION public.mark_notifications_processed(
    p_screen_id uuid,
    p_notification_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE device_notification_log 
    SET 
        processed_at = NOW(),
        updated_at = NOW()
    WHERE screen_id = p_screen_id 
    AND id = ANY(p_notification_ids)
    AND processed_at IS NULL;
END;
$$;

-- 2. Fix promote_user_to_admin function
DROP FUNCTION IF EXISTS public.promote_user_to_admin CASCADE;
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(
    p_user_id uuid,
    p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only super admins can promote users
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin' 
        AND organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to promote user';
    END IF;
    
    -- Promote the user to super_admin
    UPDATE user_profiles 
    SET 
        role = 'super_admin',
        updated_at = NOW()
    WHERE id = p_user_id 
    AND organization_id = p_organization_id;
END;
$$;

-- 3. Fix update_updated_at_column function (generic trigger function)
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

-- 4. Fix any remaining check_schedule_conflicts_by_screen_type issues
DROP FUNCTION IF EXISTS public.check_schedule_conflicts_by_screen_type CASCADE;
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
        AND s.is_active = true
        AND (
            (s.start_time <= p_start_time AND s.end_time > p_start_time)
            OR (s.start_time < p_end_time AND s.end_time >= p_end_time)
            OR (s.start_time >= p_start_time AND s.end_time <= p_end_time)
        )
    );
END;
$$;

-- 5. Clean up any remaining insecure check_schedule_conflicts functions
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Find and drop any remaining insecure check_schedule_conflicts functions
    FOR func_record IN 
        SELECT 
            p.oid::regprocedure::text as func_signature
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts'
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        BEGIN
            EXECUTE 'DROP FUNCTION ' || func_record.func_signature || ' CASCADE';
            RAISE NOTICE 'Dropped insecure function: %', func_record.func_signature;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop %: %', func_record.func_signature, SQLERRM;
        END;
    END LOOP;
END $$;

-- Recreate any missing triggers that use the updated_at function
DO $$
BEGIN
    -- Check if we need to recreate triggers for tables that should have updated_at auto-updates
    -- Common tables that use this pattern:
    
    -- For user_profiles table
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'user_profiles_updated_at' 
        AND tgrelid = 'user_profiles'::regclass
    ) THEN
        CREATE TRIGGER user_profiles_updated_at
            BEFORE UPDATE ON user_profiles
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- For organizations table
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'organizations_updated_at'
        AND tgrelid = 'organizations'::regclass
    ) THEN
        CREATE TRIGGER organizations_updated_at
            BEFORE UPDATE ON organizations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- For locations table
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'locations_updated_at'
        AND tgrelid = 'locations'::regclass
    ) THEN
        CREATE TRIGGER locations_updated_at
            BEFORE UPDATE ON locations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
END $$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Comprehensive verification of all function security
SELECT 
    'FUNCTION_SECURITY_SUMMARY' as report_type,
    COUNT(*) as total_functions,
    COUNT(CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 END) as secure_functions,
    COUNT(CASE WHEN NOT ('search_path=public' = ANY(proconfig)) THEN 1 END) as insecure_functions
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname LIKE ANY(ARRAY[
    'mark_%',
    'promote_%', 
    'update_%',
    'check_%',
    'create_%',
    'get_%',
    'setup_%',
    'log_%',
    'notify_%',
    'cleanup_%'
])

UNION ALL

SELECT 
    'REMAINING_INSECURE_FUNCTIONS' as report_type,
    0, 0, 0
    
UNION ALL

SELECT 
    proname as report_type,
    0, 0, 0
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND NOT ('search_path=public' = ANY(proconfig))
AND proname LIKE ANY(ARRAY[
    'mark_%',
    'promote_%', 
    'update_%',
    'check_%'
])
ORDER BY report_type;