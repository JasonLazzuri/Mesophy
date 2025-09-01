-- Comprehensive diagnostic for notification system
-- Run these queries in order in Supabase SQL Editor

-- 1. Find your screen information
SELECT 
    '=== YOUR SCREEN INFO ===' as section,
    id as screen_id,
    name as screen_name,
    device_type,
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

-- 4. Test trigger function directly (this will help us see if functions work)
-- We'll test the playlist items trigger since that's what you were modifying

-- First, let's see what playlist items exist
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

-- 5. Create a manual test notification with your actual screen ID
-- You'll need to replace 'YOUR_SCREEN_ID_HERE' with actual ID from query #1 above

-- Example (UNCOMMENT AND REPLACE THE SCREEN ID):
/*
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority,
    payload
) VALUES (
    'REPLACE_WITH_YOUR_SCREEN_ID'::uuid,  -- Replace with actual screen ID from query #1
    'system_message',
    'Manual test notification',
    'Testing if SSE delivers this notification',
    3,
    '{"test": true}'::jsonb
);
*/

-- 6. Check if manual notification was created
SELECT 
    '=== MANUAL NOTIFICATION CHECK ===' as section,
    COUNT(*) as total_notifications,
    MAX(created_at) as latest_created
FROM device_notifications;

-- 7. Test updating a playlist item to see if trigger fires
-- Find a playlist item to update and modify its duration
-- This should trigger the notification system

-- Get a playlist item to test with:
SELECT 
    '=== PLAYLIST ITEM TO TEST ===' as section,
    pi.id,
    pi.duration_override,
    p.name as playlist_name,
    'UPDATE playlist_items SET duration_override = COALESCE(duration_override, 10) + 1 WHERE id = ''' || pi.id || ''';' as update_command
FROM playlist_items pi
JOIN playlists p ON pi.playlist_id = p.id
LIMIT 1;

-- 8. After running the UPDATE command from query #7, check if notification was created
-- (Run this after you execute the UPDATE command shown in query #7)
/*
SELECT 
    '=== NOTIFICATION AFTER UPDATE ===' as section,
    notification_type,
    title,
    message,
    created_at,
    payload
FROM device_notifications 
ORDER BY created_at DESC
LIMIT 5;
*/