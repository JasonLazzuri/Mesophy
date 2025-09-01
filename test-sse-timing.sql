-- Test to verify the SSE timing issue

-- 1. Check all undelivered notifications for your screen (regardless of timestamp)
SELECT 
    '=== ALL UNDELIVERED NOTIFICATIONS ===' as section,
    id,
    notification_type,
    title,
    created_at,
    delivered_at,
    screen_id,
    -- Show how old each notification is
    EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_old
FROM device_notifications
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'
AND delivered_at IS NULL
ORDER BY created_at DESC;

-- 2. Show timeline of recent notifications vs current time
SELECT 
    '=== NOTIFICATION TIMELINE ===' as section,
    id,
    title,
    created_at,
    NOW() as current_time,
    EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_ago,
    CASE 
        WHEN delivered_at IS NULL THEN 'PENDING'
        ELSE 'DELIVERED'
    END as status
FROM device_notifications
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'
AND created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 3. Count notifications by delivery status
SELECT 
    '=== DELIVERY SUMMARY ===' as section,
    notification_type,
    COUNT(*) as total_count,
    COUNT(delivered_at) as delivered_count,
    COUNT(*) - COUNT(delivered_at) as pending_count
FROM device_notifications
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'
AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY notification_type
ORDER BY notification_type;