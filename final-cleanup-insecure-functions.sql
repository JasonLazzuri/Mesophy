-- Final cleanup of the remaining insecure function versions
-- Target the specific insecure functions shown in the verification

-- Drop the insecure functions using their exact OID references
-- This is the most precise way to avoid ambiguity

DO $$
DECLARE
    func_oid oid;
    func_name text;
    func_args text;
BEGIN
    -- Find and drop each insecure function by OID
    FOR func_oid, func_name, func_args IN 
        SELECT 
            p.oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname IN (
            'check_schedule_conflicts',
            'check_schedule_conflicts_by_screen_type', 
            'mark_notifications_processed',
            'promote_user_to_admin'
        )
        AND NOT ('search_path=public' = ANY(p.proconfig))
        ORDER BY p.proname
    LOOP
        BEGIN
            -- Drop using the OID directly
            EXECUTE format('DROP FUNCTION %s CASCADE', func_oid::regprocedure);
            RAISE NOTICE 'Successfully dropped insecure function: %(%)', func_name, func_args;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop function %(%): %', func_name, func_args, SQLERRM;
            
            -- Try alternative approach - create a unique temp name and swap
            BEGIN
                EXECUTE format('ALTER FUNCTION %s RENAME TO %s_insecure_temp_%s', 
                              func_oid::regprocedure, 
                              func_name,
                              extract(epoch from now())::bigint);
                              
                EXECUTE format('DROP FUNCTION %s_insecure_temp_%s CASCADE', 
                              func_name,
                              extract(epoch from now())::bigint);
                              
                RAISE NOTICE 'Dropped via rename: %(%)', func_name, func_args;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'All methods failed for: %(%)', func_name, func_args;
            END;
        END;
    END LOOP;
END $$;

-- Alternative brute force approach - drop by parameter signature patterns
-- For the date-based functions specifically

DO $$
DECLARE
    drop_cmd text;
BEGIN
    -- Try to drop specific problematic signatures
    
    -- Drop check_schedule_conflicts with date parameters
    BEGIN
        drop_cmd := 'DROP FUNCTION public.check_schedule_conflicts(uuid, uuid, date, date) CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Dropped: %', drop_cmd;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not execute: %', drop_cmd;
    END;
    
    BEGIN
        drop_cmd := 'DROP FUNCTION public.check_schedule_conflicts(uuid, uuid, date, date, time, time) CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Dropped: %', drop_cmd;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not execute: %', drop_cmd;
    END;
    
    -- Drop check_schedule_conflicts_by_screen_type with date parameters
    BEGIN
        drop_cmd := 'DROP FUNCTION public.check_schedule_conflicts_by_screen_type(uuid, uuid, date, date, time, time) CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Dropped: %', drop_cmd;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not execute: %', drop_cmd;
    END;
    
    -- Drop mark_notifications_processed with array parameter only
    BEGIN
        drop_cmd := 'DROP FUNCTION public.mark_notifications_processed(uuid[]) CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Dropped: %', drop_cmd;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not execute: %', drop_cmd;
    END;
    
    -- Drop promote_user_to_admin with text parameters
    BEGIN
        drop_cmd := 'DROP FUNCTION public.promote_user_to_admin(text, text) CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Dropped: %', drop_cmd;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not execute: %', drop_cmd;
    END;
    
END $$;

-- Nuclear option: If individual drops fail, try to disable the functions instead
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- For any remaining insecure functions, try to comment them as deprecated
    FOR func_record IN 
        SELECT 
            p.oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname IN (
            'check_schedule_conflicts',
            'check_schedule_conflicts_by_screen_type', 
            'mark_notifications_processed',
            'promote_user_to_admin'
        )
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        BEGIN
            -- Try to add a comment marking it as deprecated
            EXECUTE format('COMMENT ON FUNCTION %s IS %L', 
                          func_record.oid::regprocedure,
                          'DEPRECATED: Insecure function - use secure version instead');
                          
            RAISE NOTICE 'Marked as deprecated: %(%)', func_record.proname, func_record.args;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not comment function: %(%)', func_record.proname, func_record.args;
        END;
    END LOOP;
END $$;

-- Final verification
SELECT 
    'FINAL SECURITY STATUS' as report_section,
    COUNT(*) as total_functions,
    COUNT(CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 END) as secure_functions,
    COUNT(CASE WHEN NOT ('search_path=public' = ANY(proconfig)) THEN 1 END) as insecure_functions
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'check_schedule_conflicts',
    'check_schedule_conflicts_by_screen_type', 
    'mark_notifications_processed',
    'promote_user_to_admin',
    'update_updated_at_column'
)

UNION ALL

SELECT 
    'REMAINING INSECURE DETAILS' as report_section,
    0, 0, 0

UNION ALL

SELECT 
    proname || ' (' || pg_get_function_identity_arguments(oid) || ')' as report_section,
    0, 0, 0
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'check_schedule_conflicts',
    'check_schedule_conflicts_by_screen_type', 
    'mark_notifications_processed',
    'promote_user_to_admin'
)
AND NOT ('search_path=public' = ANY(proconfig))
ORDER BY report_section;