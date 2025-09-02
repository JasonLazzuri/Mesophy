-- Test the enhanced SSE system with comprehensive logging
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
    'Enhanced SSE Test - ' || EXTRACT(EPOCH FROM NOW()),
    'Testing enhanced 15s heartbeat system with comprehensive logging',
    3,
    NOW()
);

-- Verify notification was created
SELECT 
    '=== ENHANCED SSE TEST ===' as section,
    id,
    title,
    created_at,
    delivered_at
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC
LIMIT 3;