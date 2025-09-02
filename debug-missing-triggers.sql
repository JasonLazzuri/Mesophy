-- Debug: Are database triggers actually creating notifications?

-- Step 1: Check if triggers exist
SELECT 
    '=== DATABASE TRIGGERS STATUS ===' as section,
    trigger_name,
    event_manipulation as event,
    action_timing,
    event_object_table as table_name,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('playlists', 'playlist_items')
ORDER BY event_object_table, trigger_name;

-- Step 2: Check recent notifications (last 10 minutes)
SELECT 
    '=== RECENT NOTIFICATIONS ===' as section,
    COUNT(*) as total_notifications,
    MAX(created_at) as latest_notification,
    MIN(created_at) as earliest_notification
FROM device_notifications 
WHERE created_at > NOW() - INTERVAL '10 minutes';

-- Step 3: Show actual recent notifications
SELECT 
    '=== NOTIFICATION DETAILS ===' as section,
    id,
    title,
    notification_type,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN '❌ Not delivered'
        ELSE '✅ Delivered'
    END as status
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- Step 4: Check recent playlist updates (what should trigger notifications)
SELECT 
    '=== RECENT PLAYLIST CHANGES ===' as section,
    id,
    name,
    updated_at,
    'Should have triggered notification' as expected_behavior
FROM playlists 
WHERE updated_at > NOW() - INTERVAL '10 minutes'
ORDER BY updated_at DESC;