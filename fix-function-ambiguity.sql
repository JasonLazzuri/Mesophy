-- Fix the function ambiguity issue by being more specific
-- We need to be very precise about which functions to drop

-- First, let's see exactly what check_schedule_conflicts functions exist
-- and their exact signatures
SELECT 
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as full_signature,
    CASE WHEN 'search_path=public' = ANY(p.proconfig) THEN 'SECURE' ELSE 'INSECURE' END as status
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND p.proname = 'check_schedule_conflicts'
ORDER BY p.oid;

-- Drop the insecure functions one by one using their exact signatures
-- We'll use the regprocedure cast which handles the exact signature matching

DO $$
DECLARE
    func_signature TEXT;
    drop_cmd TEXT;
BEGIN
    -- Drop each insecure check_schedule_conflicts function by exact signature
    FOR func_signature IN 
        SELECT 
            p.oid::regprocedure::text
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts'
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        drop_cmd := 'DROP FUNCTION ' || func_signature || ' CASCADE';
        RAISE NOTICE 'Executing: %', drop_cmd;
        
        BEGIN
            EXECUTE drop_cmd;
            RAISE NOTICE 'Successfully dropped: %', func_signature;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to drop %, error: %', func_signature, SQLERRM;
        END;
    END LOOP;
END $$;

-- Now verify what's left
SELECT 
    p.proname,
    pg_get_function_identity_arguments(p.oid) as parameters,
    CASE WHEN 'search_path=public' = ANY(p.proconfig) THEN '✅ SECURE' ELSE '❌ INSECURE' END as status
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND p.proname = 'check_schedule_conflicts'
ORDER BY status, parameters;

-- If there are still insecure functions, create the secure versions we need
-- Only create if they don't already exist

-- Check if we have the main version
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts'
        AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid, timestamp%, timestamp%'
        AND 'search_path=public' = ANY(p.proconfig)
    ) THEN
        -- Create the main secure version
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
        AS $func$
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
        $func$;
        
        RAISE NOTICE 'Created secure check_schedule_conflicts function';
    END IF;
END $$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final verification - show all functions and their security status
SELECT 
    'SUMMARY' as section,
    COUNT(*) as total_functions,
    COUNT(CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 END) as secure_functions,
    COUNT(CASE WHEN NOT ('search_path=public' = ANY(proconfig)) THEN 1 END) as insecure_functions
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname = 'check_schedule_conflicts'

UNION ALL

SELECT 
    'DETAILS' as section,
    0, 0, 0  -- Placeholder for formatting
    
UNION ALL

SELECT 
    CASE WHEN 'search_path=public' = ANY(proconfig) THEN '✅ SECURE' ELSE '❌ INSECURE' END as section,
    0 as total_functions,
    0 as secure_functions, 
    0 as insecure_functions
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname = 'check_schedule_conflicts'
ORDER BY section;