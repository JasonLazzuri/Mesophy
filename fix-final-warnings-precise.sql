-- Fix the final warnings with precise function handling
-- Avoid the function ambiguity error by being very specific

-- First, let's identify exactly what functions exist and their signatures
SELECT 
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as full_signature,
    p.oid::regprocedure::text as drop_signature,
    CASE WHEN 'search_path=public' = ANY(p.proconfig) THEN 'SECURE' ELSE 'INSECURE' END as status
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND p.proname IN (
    'mark_notifications_processed',
    'promote_user_to_admin', 
    'update_updated_at_column',
    'check_schedule_conflicts_by_screen_type',
    'check_schedule_conflicts'
)
ORDER BY p.proname, status;

-- Drop insecure functions using their exact OID-based signatures
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Process each insecure function individually
    FOR func_record IN 
        SELECT 
            p.oid::regprocedure::text as exact_signature,
            p.proname
        FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname IN (
            'mark_notifications_processed',
            'promote_user_to_admin', 
            'update_updated_at_column',
            'check_schedule_conflicts_by_screen_type'
        )
        AND NOT ('search_path=public' = ANY(p.proconfig))
    LOOP
        BEGIN
            EXECUTE 'DROP FUNCTION ' || func_record.exact_signature || ' CASCADE';
            RAISE NOTICE 'Successfully dropped insecure function: %', func_record.exact_signature;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to drop function % - Error: %', func_record.exact_signature, SQLERRM;
        END;
    END LOOP;
END $$;

-- Now create the secure versions (only if they don't already exist)

-- 1. Create mark_notifications_processed if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'mark_notifications_processed'
        AND 'search_path=public' = ANY(p.proconfig)
    ) THEN
        CREATE OR REPLACE FUNCTION public.mark_notifications_processed(
            p_screen_id uuid,
            p_notification_ids uuid[]
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $func$
        BEGIN
            UPDATE device_notification_log 
            SET 
                processed_at = NOW(),
                updated_at = NOW()
            WHERE screen_id = p_screen_id 
            AND id = ANY(p_notification_ids)
            AND processed_at IS NULL;
        END;
        $func$;
        
        RAISE NOTICE 'Created secure mark_notifications_processed function';
    END IF;
END $$;

-- 2. Create promote_user_to_admin if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'promote_user_to_admin'
        AND 'search_path=public' = ANY(p.proconfig)
    ) THEN
        CREATE OR REPLACE FUNCTION public.promote_user_to_admin(
            p_user_id uuid,
            p_organization_id uuid
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $func$
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
        $func$;
        
        RAISE NOTICE 'Created secure promote_user_to_admin function';
    END IF;
END $$;

-- 3. Create update_updated_at_column if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'update_updated_at_column'
        AND 'search_path=public' = ANY(p.proconfig)
    ) THEN
        CREATE OR REPLACE FUNCTION public.update_updated_at_column()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$;
        
        RAISE NOTICE 'Created secure update_updated_at_column function';
    END IF;
END $$;

-- 4. Create check_schedule_conflicts_by_screen_type if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND p.proname = 'check_schedule_conflicts_by_screen_type'
        AND 'search_path=public' = ANY(p.proconfig)
    ) THEN
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
        AS $func$
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
        $func$;
        
        RAISE NOTICE 'Created secure check_schedule_conflicts_by_screen_type function';
    END IF;
END $$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Final verification showing only the functions we care about
SELECT 
    proname as function_name,
    CASE WHEN 'search_path=public' = ANY(proconfig) THEN '✅ SECURE' ELSE '❌ INSECURE' END as status,
    pg_get_function_identity_arguments(oid) as parameters
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'mark_notifications_processed',
    'promote_user_to_admin', 
    'update_updated_at_column',
    'check_schedule_conflicts_by_screen_type',
    'check_schedule_conflicts'
)
ORDER BY 
    CASE WHEN 'search_path=public' = ANY(proconfig) THEN 1 ELSE 0 END,
    proname;