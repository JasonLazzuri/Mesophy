-- Force fix the schedule-screen relationships
-- The UPDATE commands aren't working, so let's try different approaches

-- 1. Check if there are RLS policies blocking the update
SELECT 
    'RLS policies on schedules' as info,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'schedules';

-- 2. Try updating with explicit WHERE conditions for each schedule
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE name = 'Employee boards' AND screen_id IS NULL;

UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid  
WHERE name = 'Menu Board' AND screen_id IS NULL;

-- 3. Check if the individual updates worked
SELECT 
    'After individual updates' as status,
    name,
    screen_id,
    CASE 
        WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 'LINKED ✅'
        WHEN screen_id IS NULL THEN 'NOT LINKED ❌'
        ELSE 'WRONG SCREEN ❌'
    END as link_status
FROM schedules 
WHERE is_active = true;

-- 4. If still not working, try with service role (if you have access)
-- This bypasses RLS policies
SET role 'service_role';
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE screen_id IS NULL AND is_active = true;
RESET role;

-- 5. Final verification
SELECT 
    'Final check' as status,
    name,
    screen_id,
    CASE 
        WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 'LINKED ✅'
        ELSE 'STILL BROKEN ❌'
    END as link_status
FROM schedules 
WHERE is_active = true;