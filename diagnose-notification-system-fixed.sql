-- Fixed comprehensive diagnostic for notification system
-- Run these queries in order in Supabase SQL Editor

-- 1. Find your screen information (fixed column names)
SELECT 
    '=== YOUR SCREEN INFO ===' as section,
    id as screen_id,
    name as screen_name,
    screen_type,
    location_id,
    organization_id,
    device_id,
    is_active
FROM screens 
ORDER BY created_at DESC
LIMIT 10;

-- 2. Find schedules that should trigger notifications
SELECT 
    '=== ACTIVE SCHEDULES ===' as section,
    s.id as schedule_id,
    s.name as schedule_name,
    s.screen_id,
    s.playlist_id,
    s.is_active,
    sc.name as screen_name
FROM schedules s
JOIN screens sc ON s.screen_id = sc.id
WHERE s.is_active = true
ORDER BY s.created_at DESC
LIMIT 10;

-- 3. Find playlists that should trigger notifications
SELECT 
    '=== PLAYLISTS WITH SCHEDULES ===' as section,
    p.id as playlist_id,
    p.name as playlist_name,
    COUNT(s.id) as schedule_count,
    ARRAY_AGG(s.screen_id) as affected_screen_ids
FROM playlists p
JOIN schedules s ON p.id = s.playlist_id
WHERE s.is_active = true
GROUP BY p.id, p.name
ORDER BY p.name;

-- 4. Show playlist items (what you've been modifying)
SELECT 
    '=== PLAYLIST ITEMS ===' as section,
    pi.id,
    pi.playlist_id,
    pi.media_asset_id,
    pi.order_index,
    pi.duration_override,
    p.name as playlist_name
FROM playlist_items pi
JOIN playlists p ON pi.playlist_id = p.id
ORDER BY p.name, pi.order_index
LIMIT 20;

-- 5. Check current notification count
SELECT 
    '=== CURRENT NOTIFICATIONS ===' as section,
    COUNT(*) as total_notifications
FROM device_notifications;

-- 6. Manual test notification creation
-- STEP 1: Copy your screen_id from query #1 above
-- STEP 2: Uncomment and replace YOUR_SCREEN_ID_HERE with the actual UUID

/*
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority,
    payload
) VALUES (
    'YOUR_SCREEN_ID_HERE'::uuid,  -- Replace with actual screen ID from query #1
    'system_message',
    'Manual test notification',
    'Testing if SSE delivers this notification',
    3,
    '{"test": true}'::jsonb
);
*/

-- 7. After creating manual notification, check if it exists
-- (Run this after step 6)
/*
SELECT 
    '=== MANUAL NOTIFICATION CHECK ===' as section,
    notification_type,
    title,
    message,
    created_at,
    screen_id
FROM device_notifications 
ORDER BY created_at DESC
LIMIT 5;
*/

-- 8. Test playlist item update to trigger notification
-- Get a specific playlist item to test with:
SELECT 
    '=== PLAYLIST ITEM TO TEST UPDATE ===' as section,
    pi.id,
    pi.duration_override,
    p.name as playlist_name,
    'UPDATE playlist_items SET duration_override = ' || COALESCE(pi.duration_override, 10) + 1 || ' WHERE id = ''' || pi.id || ''';' as update_command
FROM playlist_items pi
JOIN playlists p ON pi.playlist_id = p.id
LIMIT 1;