-- Test heartbeat-based notification delivery
-- Insert a test notification to see if the new 30-second heartbeat system picks it up

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
    'Heartbeat Test - ' || NOW()::time,
    'Testing new 30-second heartbeat notification system',
    3,
    NOW()
);

-- Check if notification was created
SELECT 
    '=== NEW HEARTBEAT TEST NOTIFICATION ===' as section,
    id,
    title,
    message,
    created_at,
    CASE 
        WHEN delivered_at IS NULL THEN '⏳ Not delivered yet'
        ELSE '✅ Delivered at ' || delivered_at::text
    END as delivery_status
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC
LIMIT 5;