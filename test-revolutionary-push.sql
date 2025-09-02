-- Test the REVOLUTIONARY push notification system
-- This should be delivered INSTANTLY to the Android TV (within milliseconds)

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
    'REVOLUTIONARY PUSH TEST - ' || EXTRACT(EPOCH FROM NOW()),
    'Testing instant real-time delivery with ZERO database polling!',
    3,
    NOW()
);

-- Verify the notification was created
SELECT 
    '=== REVOLUTIONARY PUSH TEST ===' as section,
    id,
    title,
    message,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN '⏳ Pending instant delivery'
        ELSE '🚀 Delivered in ' || 
             EXTRACT(EPOCH FROM delivered_at - created_at) || ' seconds'
    END as delivery_speed
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC
LIMIT 1;