-- Monitor notifications during dashboard changes
-- Run this BEFORE making dashboard changes, then run again AFTER

-- 1. Current notification count and recent notifications
SELECT 
    '=== RECENT NOTIFICATIONS (LAST 10 MINUTES) ===' as section,
    id,
    notification_type,
    title,
    message,
    screen_id,
    playlist_id,
    media_asset_id,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN 'PENDING'
        ELSE 'DELIVERED'
    END as status
FROM device_notifications
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- 2. Current playlist structure
SELECT 
    '=== CURRENT PLAYLIST STRUCTURE ===' as section,
    p.name as playlist_name,
    pi.id as item_id,
    pi.order_index,
    pi.duration_override,
    ma.name as media_name,
    ma.created_at as media_created
FROM playlist_items pi
JOIN playlists p ON pi.playlist_id = p.id
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE p.id = 'adbec30e-dfc5-4b9e-8478-de417c2c710d'
ORDER BY pi.order_index;

-- 3. Playlist metadata
SELECT 
    '=== PLAYLIST METADATA ===' as section,
    id,
    name,
    created_at,
    updated_at,
    (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = p.id) as item_count
FROM playlists p
WHERE p.id = 'adbec30e-dfc5-4b9e-8478-de417c2c710d';

-- Instructions:
-- 1. Run this query and note the results
-- 2. Make your dashboard change (add image to playlist)
-- 3. Run this query again immediately after
-- 4. Compare the before/after results to see what changed