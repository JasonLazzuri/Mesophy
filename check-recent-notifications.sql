-- Check recent device notifications to see if duration changes triggered notifications
SELECT 
    '=== RECENT DEVICE NOTIFICATIONS ===' as section,
    id,
    notification_type,
    title,
    message,
    screen_id,
    playlist_id,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN 'PENDING'
        ELSE 'DELIVERED'
    END as status
FROM device_notifications
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 10;

-- Also check current playlist item durations to see if they were updated
SELECT 
    '=== CURRENT PLAYLIST ITEM DURATIONS ===' as section,
    pi.id,
    pl.name as playlist_name,
    ma.name as media_name,
    pi.duration_override as duration_seconds,
    pi.updated_at
FROM playlist_items pi
JOIN playlists pl ON pi.playlist_id = pl.id
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE pi.updated_at >= NOW() - INTERVAL '10 minutes'
ORDER BY pi.updated_at DESC;