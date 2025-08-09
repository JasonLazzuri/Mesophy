-- Check current RLS policies on schedules table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'schedules'
ORDER BY policyname;

-- Check if RLS is enabled on schedules table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'schedules';

-- Check user_has_org_access function (if it exists)
SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'user_has_org_access'
) AS user_has_org_access_exists;

-- Check get_user_organization_id function (if it exists) 
SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_user_organization_id'
) AS get_user_organization_id_exists;