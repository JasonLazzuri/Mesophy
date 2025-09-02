-- Debug why SSE polling isn't delivering notifications

-- Check 1: Are notifications being created?
SELECT 
    '=== RECENT NOTIFICATIONS ===' as section,
    notification_type,
    title,
    created_at,
    delivered_at,
    CASE 
        WHEN delivered_at IS NULL THEN '⏳ Not delivered yet'
        ELSE '✅ Delivered at ' || delivered_at::text
    END as delivery_status
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC;

-- Check 2: Create a fresh notification to test polling
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'playlist_change',
    'SSE Polling Test - ' || NOW()::time,
    'Testing if SSE polling picks this up within 2 seconds',
    3
);

-- Check 3: Show the query that SSE polling should be running
SELECT 
    '=== SSE POLLING QUERY ===' as section,
    'This is what SSE should find:' as description;

-- This mimics the exact query from the SSE endpoint
SELECT 
    '=== UNDELIVERED NOTIFICATIONS ===' as section,
    id,
    notification_type,
    title,
    created_at,
    'SSE should deliver this' as action
FROM device_notifications
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND delivered_at IS NULL
ORDER BY created_at ASC;

-- Instructions
SELECT 
    '=== WATCH ANDROID TV LOGS ===' as section,
    'The notification created above should appear within 2-4 seconds' as instruction,
    'Look for content_update SSE event' as what_to_look_for;