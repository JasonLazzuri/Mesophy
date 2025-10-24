-- Fix the final 2 remaining insecure check_schedule_conflicts functions
-- These have old parameter signatures with date types instead of timestamptz

-- Drop the specific functions with the exact signatures shown
-- First signature: schedule_uuid uuid, p_screen_id uuid, p_start_date date, p_end_date date, ...
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, date, date, time) CASCADE;
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(uuid, uuid, date, date, time, time) CASCADE;

-- Use a more comprehensive approach to find and drop these exact functions
DO $$
DECLARE
    func_record RECORD;
    drop_statement TEXT;
BEGIN
    -- Find the exact insecure check_schedule_conflicts functions
    FOR func_record IN 
        SELECT 
            p.oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts'
        AND NOT ('search_path=public' = ANY(p.proconfig))
        AND pg_get_function_identity_arguments(p.oid) LIKE '%date%'
    LOOP
        drop_statement := format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', 
                               func_record.proname, 
                               func_record.identity_args);
        
        RAISE NOTICE 'Dropping insecure date-based function: %', drop_statement;
        EXECUTE drop_statement;
    END LOOP;
END $$;

-- Also try dropping by OID for the most stubborn ones
DO $$
DECLARE
    func_oid OID;
BEGIN
    -- Find any remaining check_schedule_conflicts functions without search_path
    FOR func_oid IN 
        SELECT p.oid
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts'
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        RAISE NOTICE 'Dropping function by OID: %', func_oid;
        EXECUTE format('DROP FUNCTION %s CASCADE', func_oid::regprocedure);
    END LOOP;
END $$;

-- Alternative approach: Drop all check_schedule_conflicts and recreate only the secure ones
DROP FUNCTION IF EXISTS public.check_schedule_conflicts CASCADE;

-- Recreate only the essential secure versions
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

-- Create the by-screen-type version if needed
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

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final verification - should show NO insecure functions
SELECT 
    COUNT(*) as total_functions,
    COUNT(CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 END) as secure_functions,
    COUNT(CASE WHEN NOT ('search_path=public' = ANY(proconfig)) THEN 1 END) as insecure_functions
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname LIKE ANY(ARRAY['check_%', 'create_%', 'get_%', 'setup_%', 'log_%', 'notify_%', 'cleanup_%']);

-- Show any remaining insecure functions
SELECT 
    proname as function_name,
    '❌ STILL_INSECURE' as status,
    pg_get_function_identity_arguments(oid) as parameters
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND NOT ('search_path=public' = ANY(proconfig))
ORDER BY proname;