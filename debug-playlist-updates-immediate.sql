-- Quick diagnostic: Check if playlist updates are creating notifications
-- Run this immediately after updating a playlist in the dashboard

-- Check 1: Are schedules linked to your Android TV screen?
SELECT 
    '=== SCHEDULE LINKS ===' as section,
    COUNT(*) as total_active_schedules,
    COUNT(CASE WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 1 END) as linked_to_android_tv,
    CASE 
        WHEN COUNT(CASE WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 1 END) = 0 
        THEN '❌ NO SCHEDULES LINKED - This is the problem!'
        ELSE '✅ Schedules are linked'
    END as diagnosis
FROM schedules 
WHERE is_active = true;

-- Check 2: Recent notifications in last 10 minutes (should show any from your playlist update)
SELECT 
    '=== RECENT NOTIFICATIONS ===' as section,
    notification_type,
    title,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN '⏳ Pending'
        ELSE '✅ Delivered'
    END as status
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 5;

-- Check 3: If no recent notifications, let's manually trigger one to test the system
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority,
    payload
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'playlist_change',
    'Manual Test - Check Android TV Logs',
    'This notification should appear in Android TV logs within 5 seconds',
    3,
    jsonb_build_object(
        'action', 'manual_test',
        'timestamp', NOW()::text
    )
);

-- Check 4: Verify the manual notification was created
SELECT 
    '=== MANUAL TEST NOTIFICATION ===' as section,
    'Check Android TV logs for this notification' as instruction,
    COUNT(*) as notifications_created_just_now
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '30 seconds';

-- Check 5: What playlists are actually linked to schedules?
SELECT 
    '=== PLAYLIST-SCHEDULE RELATIONSHIPS ===' as section,
    p.name as playlist_name,
    s.name as schedule_name,
    s.screen_id,
    CASE 
        WHEN s.screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN '✅ Will notify Android TV'
        WHEN s.screen_id IS NULL THEN '❌ Not linked to any screen'
        ELSE '⚠️ Linked to different screen'
    END as notification_status
FROM playlists p
JOIN schedules s ON p.id = s.playlist_id
WHERE s.is_active = true
ORDER BY p.name;