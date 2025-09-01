-- Final test and fix for playlist notifications to Android TV
-- Run this in Supabase SQL editor to fix and test the notification system

-- STEP 1: Fix the schedule-screen relationship (this is the root cause)
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE screen_id IS NULL 
  AND is_active = true;

-- STEP 2: Verify the fix worked
SELECT 
    '=== SCHEDULES AFTER FIX ===' as section,
    COUNT(*) as total_schedules,
    COUNT(CASE WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 1 END) as linked_to_android_tv
FROM schedules
WHERE is_active = true;

-- STEP 3: Create a test notification that should appear immediately on Android TV
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority,
    payload
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'system_message',
    'Notification System Fixed!',
    'If you see this in Android TV logs, notifications are working',
    3,
    '{"test": "manual_verification", "timestamp": "' || NOW()::text || '"}'::jsonb
);

-- STEP 4: Simulate a playlist update (this should trigger automatic notification)
UPDATE playlists 
SET updated_at = NOW()
WHERE is_active = true
AND id IN (
    SELECT DISTINCT playlist_id 
    FROM schedules 
    WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
    AND is_active = true
    LIMIT 1
);

-- STEP 5: Check what notifications were just created
SELECT 
    '=== NEW NOTIFICATIONS ===' as section,
    notification_type,
    title,
    message,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN '⏳ Pending delivery'
        ELSE '✅ Delivered'
    END as delivery_status
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC;

-- STEP 6: Summary of what should happen
SELECT 
    '=== WHAT TO EXPECT ===' as info,
    'Check Android TV logs within 2-5 seconds' as action,
    'Look for SSE events with notification content' as details,
    'You should see both manual and automatic notifications' as expected_result;