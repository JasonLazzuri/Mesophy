-- Get your screen ID and fix the schedule relationships

-- 1. Get your screen ID
SELECT 
    '=== YOUR SCREEN INFO ===' as section,
    id as screen_id,
    name as screen_name,
    created_at
FROM screens
ORDER BY created_at DESC;

-- 2. After you get the screen_id from above, run this update command:
-- Replace 'YOUR_SCREEN_ID_HERE' with the actual screen_id from query #1

/*
UPDATE schedules 
SET screen_id = 'YOUR_SCREEN_ID_HERE'::uuid
WHERE screen_id IS NULL 
  AND is_active = true;
*/

-- 3. Verify the fix worked
-- (Run this after the UPDATE command above)
/*
SELECT 
    '=== SCHEDULES AFTER FIX ===' as section,
    s.id,
    s.name as schedule_name,
    s.screen_id,
    sc.name as screen_name,
    p.name as playlist_name
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id  
LEFT JOIN playlists p ON s.playlist_id = p.id
WHERE s.is_active = true;
*/

-- 4. Test that notifications now work by creating a manual test
-- (Run this after the UPDATE to test the fixed relationship)
/*
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority
) VALUES (
    'YOUR_SCREEN_ID_HERE'::uuid,  -- Same screen_id as in step 2
    'system_message',
    'Schedule fix test',
    'Testing notifications after fixing schedule relationships',
    3
);
*/

-- 5. Check if test notification was created
/*
SELECT 
    '=== TEST NOTIFICATION ===' as section,
    notification_type,
    title, 
    message,
    created_at,
    screen_id
FROM device_notifications
ORDER BY created_at DESC
LIMIT 3;
*/