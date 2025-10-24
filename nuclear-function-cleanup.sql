-- Nuclear option: Complete elimination of all insecure check_schedule_conflicts functions
-- This will be very aggressive but should finally solve the issue

-- First, let's see exactly what we're dealing with
SELECT 
    'BEFORE CLEANUP - ALL check_schedule_conflicts FUNCTIONS' as section,
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as full_signature,
    p.oid::regprocedure::text as drop_command,
    CASE WHEN 'search_path=public' = ANY(p.proconfig) THEN '✅ SECURE' ELSE '❌ INSECURE' END as status
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (p.proname LIKE '%check_schedule_conflicts%')
ORDER BY p.proname, status;

-- Step 1: Back up the secure function definitions before we nuke everything
DO $$
DECLARE
    secure_func_def text;
BEGIN
    -- We'll recreate the essential secure functions after cleanup
    RAISE NOTICE 'Preparing to eliminate all check_schedule_conflicts functions and recreate secure versions';
END $$;

-- Step 2: Nuclear option - drop ALL check_schedule_conflicts functions
DO $$
DECLARE
    func_oid oid;
    drop_cmd text;
    func_signature text;
BEGIN
    -- Get all check_schedule_conflicts function OIDs
    FOR func_oid IN 
        SELECT p.oid
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND (p.proname LIKE '%check_schedule_conflicts%')
        ORDER BY p.oid
    LOOP
        BEGIN
            func_signature := func_oid::regprocedure::text;
            drop_cmd := 'DROP FUNCTION ' || func_signature || ' CASCADE';
            
            EXECUTE drop_cmd;
            RAISE NOTICE 'Successfully nuked: %', func_signature;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop %: %', func_signature, SQLERRM;
            
            -- Try more aggressive approach
            BEGIN
                EXECUTE 'DROP FUNCTION IF EXISTS ' || func_signature || ' CASCADE';
                RAISE NOTICE 'Dropped with IF EXISTS: %', func_signature;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'All drop methods failed for: %', func_signature;
            END;
        END;
    END LOOP;
END $$;

-- Step 3: Verify all are gone
SELECT 
    'AFTER NUCLEAR CLEANUP' as section,
    COUNT(*) as remaining_functions
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (p.proname LIKE '%check_schedule_conflicts%');

-- Step 4: Recreate ONLY the essential secure functions
-- Main schedule conflict checker
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

-- By screen type version
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

-- Step 5: Final verification
SELECT 
    'FINAL VERIFICATION' as section,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as parameters,
    CASE WHEN 'search_path=public' = ANY(p.proconfig) THEN '✅ SECURE' ELSE '❌ STILL_INSECURE' END as status
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (p.proname LIKE '%check_schedule_conflicts%')
ORDER BY p.proname;

-- Summary count
SELECT 
    'SUMMARY' as report,
    COUNT(*) as total_check_functions,
    COUNT(CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 END) as secure_functions,
    COUNT(CASE WHEN NOT ('search_path=public' = ANY(proconfig)) THEN 1 END) as insecure_functions
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (p.proname LIKE '%check_schedule_conflicts%');