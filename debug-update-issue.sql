-- Debug why the UPDATE didn't work
-- Run these queries to see what's happening

-- 1. Check if screen ID exists
SELECT 
    '=== SCREEN EXISTS CHECK ===' as section,
    id,
    name
FROM screens 
WHERE id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid;

-- 2. Check current schedules again
SELECT 
    '=== CURRENT SCHEDULES ===' as section,
    id,
    name,
    screen_id,
    is_active
FROM schedules;

-- 3. Try the update again with more explicit conditions
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE id IN (
    '905d07da-b70d-4ce1-a22e-253aeafb6fd4'::uuid,
    '71ead260-f147-4638-8a3b-a1585ea79f62'::uuid
);

-- 4. Check if the update worked this time
SELECT 
    '=== SCHEDULES AFTER EXPLICIT UPDATE ===' as section,
    id,
    name,
    screen_id,
    is_active
FROM schedules;

-- 5. If that worked, test manual notification
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'system_message',
    'After explicit update test',
    'Testing notifications with explicit schedule IDs',
    3
);

-- 6. Check notification was created
SELECT 
    '=== NOTIFICATION CHECK ===' as section,
    COUNT(*) as notification_count,
    MAX(created_at) as latest_notification
FROM device_notifications;