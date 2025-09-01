-- Compare format of working test notifications vs real dashboard notifications

-- 1. Show recent test notifications (these worked via SSE)
SELECT 
    '=== TEST NOTIFICATIONS (WORKING) ===' as section,
    id,
    notification_type,
    title,
    message,
    screen_id,
    playlist_id,
    media_asset_id,
    schedule_id,
    priority,
    delivered_at,
    payload,
    CASE 
        WHEN delivered_at IS NULL THEN 'PENDING'
        ELSE 'DELIVERED'
    END as delivery_status
FROM device_notifications
WHERE title LIKE '%Test%'
ORDER BY created_at DESC
LIMIT 3;

-- 2. Show recent dashboard-triggered notifications (not working via SSE)
SELECT 
    '=== DASHBOARD NOTIFICATIONS (NOT WORKING) ===' as section,
    id,
    notification_type,
    title,
    message,
    screen_id,
    playlist_id,
    media_asset_id,
    schedule_id,
    priority,
    delivered_at,
    payload,
    CASE 
        WHEN delivered_at IS NULL THEN 'PENDING'
        ELSE 'DELIVERED'
    END as delivery_status
FROM device_notifications
WHERE title NOT LIKE '%Test%'
AND created_at >= NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Check if there are any undelivered notifications for your screen
SELECT 
    '=== UNDELIVERED NOTIFICATIONS FOR YOUR SCREEN ===' as section,
    COUNT(*) as pending_count,
    MIN(created_at) as oldest_pending,
    MAX(created_at) as newest_pending
FROM device_notifications
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'
AND delivered_at IS NULL;