-- Fix the schedule-screen relationship for screen ID: 003a361b-681d-4299-8337-bd7e5c09d1ed

-- STEP 1: Update schedules to link them to your screen
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE screen_id IS NULL 
  AND is_active = true;

-- STEP 2: Verify the fix worked
SELECT 
    '=== SCHEDULES AFTER FIX ===' as section,
    s.id,
    s.name as schedule_name,
    s.screen_id,
    p.name as playlist_name
FROM schedules s
LEFT JOIN playlists p ON s.playlist_id = p.id
WHERE s.is_active = true;

-- STEP 3: Test with a manual notification
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'system_message',
    'Schedule fix test',
    'Testing notifications after fixing schedule relationships',
    3
);

-- STEP 4: Check if test notification was created
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