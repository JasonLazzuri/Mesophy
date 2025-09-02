-- Debug why manual notifications aren't appearing in Android TV logs
-- Even though they should be pushed instantly via Supabase real-time

-- Step 1: Verify notifications were actually created
SELECT 
    '=== RECENT NOTIFICATIONS IN DATABASE ===' as section,
    id,
    screen_id,
    notification_type,
    title,
    message,
    created_at,
    delivered_at,
    AGE(NOW(), created_at) as age
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- Step 2: Check if notifications exist but for wrong screen ID
SELECT 
    '=== ALL RECENT NOTIFICATIONS (ANY SCREEN) ===' as section,
    id,
    screen_id,
    title,
    created_at,
    CASE 
        WHEN screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN '✅ Correct screen'
        ELSE '❌ Wrong screen: ' || screen_id::text
    END as screen_match
FROM device_notifications 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- Step 3: Test with a very obvious notification
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority,
    created_at
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'playlist_change',
    'URGENT DEBUG TEST - ' || EXTRACT(EPOCH FROM NOW())::text,
    'If you see this notification on Android TV, real-time push is working!',
    1,
    NOW()
);

-- Step 4: Immediately check if it was created
SELECT 
    '=== URGENT DEBUG TEST RESULT ===' as section,
    id,
    title,
    created_at,
    delivered_at,
    'Should appear on Android TV NOW' as expected
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND title LIKE 'URGENT DEBUG TEST%'
ORDER BY created_at DESC
LIMIT 1;

-- Step 5: Check table exists and basic info
SELECT 
    '=== TABLE INFO ===' as section,
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hasrules
FROM pg_tables 
WHERE tablename = 'device_notifications';

-- Step 6: Show total notification count for context
SELECT 
    '=== NOTIFICATION SUMMARY ===' as section,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid) as our_screen_notifications,
    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) as delivered_notifications,
    COUNT(*) FILTER (WHERE delivered_at IS NULL) as undelivered_notifications
FROM device_notifications;