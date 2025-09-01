-- Safe diagnostic - check actual table structure first
-- Run these queries in order in Supabase SQL Editor

-- 1. Check what columns actually exist in screens table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'screens' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Get screen data with only basic columns we know exist
SELECT 
    '=== YOUR SCREEN INFO ===' as section,
    id as screen_id,
    name as screen_name,
    created_at
FROM screens 
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check schedules table structure
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'schedules' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Get schedules with basic info
SELECT 
    '=== ACTIVE SCHEDULES ===' as section,
    s.id as schedule_id,
    s.name as schedule_name,
    s.screen_id,
    s.playlist_id,
    s.is_active
FROM schedules s
WHERE s.is_active = true
ORDER BY s.created_at DESC
LIMIT 10;

-- 5. Check device_notifications table structure
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'device_notifications' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 6. Check current notification count
SELECT 
    '=== CURRENT NOTIFICATIONS ===' as section,
    COUNT(*) as total_notifications
FROM device_notifications;

-- 7. Show playlists and their relationships to schedules
SELECT 
    '=== PLAYLISTS WITH SCHEDULES ===' as section,
    p.id as playlist_id,
    p.name as playlist_name,
    COUNT(s.id) as schedule_count,
    ARRAY_AGG(s.screen_id) as affected_screen_ids
FROM playlists p
LEFT JOIN schedules s ON p.id = s.playlist_id AND s.is_active = true
GROUP BY p.id, p.name
HAVING COUNT(s.id) > 0
ORDER BY p.name;

-- 8. After you get the screen_id from query #2, create a manual test notification:

-- STEP 1: Copy your screen_id from query #2
-- STEP 2: Uncomment this and replace YOUR_SCREEN_ID_HERE:

/*
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority
) VALUES (
    'YOUR_SCREEN_ID_HERE'::uuid,
    'system_message',
    'Manual test notification',
    'Testing SSE delivery',
    3
);
*/

-- 9. Check if the manual notification was created:
/*
SELECT 
    '=== NOTIFICATIONS AFTER MANUAL INSERT ===' as section,
    *
FROM device_notifications 
ORDER BY created_at DESC
LIMIT 5;
*/