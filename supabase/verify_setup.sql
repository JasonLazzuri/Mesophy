-- Verification script to check the current database state

-- Check if required data exists
SELECT '=== ORGANIZATION CHECK ===' as section;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Organization exists'
        ELSE '❌ No organization found - run seed.sql first'
    END as status,
    COUNT(*) as count
FROM organizations 
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

SELECT '=== USER PROFILE CHECK ===' as section;
SELECT 
    id,
    email,
    COALESCE(role::text, 'NULL') as role,
    COALESCE(organization_id::text, 'NULL') as organization_id,
    COALESCE(full_name, 'NULL') as full_name,
    created_at
FROM user_profiles 
ORDER BY created_at DESC
LIMIT 5;

SELECT '=== AUTH USERS CHECK ===' as section;
SELECT 
    id,
    email,
    email_confirmed_at IS NOT NULL as email_confirmed,
    created_at
FROM auth.users 
ORDER BY created_at DESC
LIMIT 5;

SELECT '=== SAMPLE DATA CHECK ===' as section;
SELECT 
    (SELECT COUNT(*) FROM districts) as districts_count,
    (SELECT COUNT(*) FROM locations) as locations_count,
    (SELECT COUNT(*) FROM screens) as screens_count;