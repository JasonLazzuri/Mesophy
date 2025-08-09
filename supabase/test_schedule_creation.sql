-- Test script to simulate what the API is trying to do
-- This will help identify the exact cause of the 500 error

-- Step 1: Check if we have the required data for testing
SELECT 'Organizations available:' as check_type, COUNT(*) as count FROM organizations;
SELECT 'Users available:' as check_type, COUNT(*) as count FROM user_profiles;
SELECT 'Playlists available:' as check_type, COUNT(*) as count FROM playlists;
SELECT 'Screens available:' as check_type, COUNT(*) as count FROM screens;

-- Step 2: Get sample data for testing
SELECT 
    o.id as org_id, 
    o.name as org_name,
    p.id as playlist_id,
    p.name as playlist_name,
    u.id as user_id,
    u.email as user_email
FROM organizations o
CROSS JOIN playlists p
CROSS JOIN user_profiles u
WHERE p.organization_id = o.id
AND u.organization_id = o.id
LIMIT 1;

-- Step 3: Try to simulate the INSERT that the API is doing
-- Replace the UUID values below with actual values from Step 2
-- INSERT INTO schedules (
--     organization_id,
--     name,
--     playlist_id,
--     screen_id,
--     start_date,
--     end_date,
--     start_time,
--     end_time,
--     days_of_week,
--     timezone,
--     priority,
--     created_by,
--     is_active
-- ) VALUES (
--     'YOUR_ORG_ID_HERE',
--     'Test Schedule',
--     'YOUR_PLAYLIST_ID_HERE', 
--     NULL,
--     CURRENT_DATE,
--     NULL,
--     '09:00:00',
--     '17:00:00',
--     ARRAY[0,1,2,3,4,5,6],
--     'UTC',
--     1,
--     'YOUR_USER_ID_HERE',
--     true
-- );

-- Step 4: Check current schedules table structure again
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'schedules' 
ORDER BY ordinal_position;