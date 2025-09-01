-- Check the exact format of our test notification to see if SSE endpoint can find it
SELECT 
    '=== TEST NOTIFICATION DETAILS ===' as section,
    id,
    screen_id,
    notification_type,
    title,
    message,
    playlist_id,
    media_asset_id,
    schedule_id,
    priority,
    created_at,
    delivered_at,
    payload
FROM device_notifications
WHERE title = 'Test Duration Update'
ORDER BY created_at DESC
LIMIT 1;