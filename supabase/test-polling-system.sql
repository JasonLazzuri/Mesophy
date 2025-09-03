-- Test the new polling-based notification system
-- This replaces the failing SSE approach with reliable HTTP polling

-- Step 1: Test database setup
SELECT 
    '=== POLLING SYSTEM SETUP STATUS ===' as section,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_notification_log') 
        THEN '✅ device_notification_log table exists'
        ELSE '❌ device_notification_log table missing'
    END as table_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_device_notifications')
        THEN '✅ get_device_notifications function exists'
        ELSE '❌ get_device_notifications function missing'
    END as function_status;

-- Step 2: Show current notification status
SELECT 
    '=== CURRENT NOTIFICATIONS ===' as section,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE processed_at IS NULL) as pending_notifications,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed_notifications,
    MAX(created_at) as latest_notification
FROM device_notification_log
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid;

-- Step 3: Create test notification to verify polling works
INSERT INTO device_notification_log (screen_id, change_type, change_data)
VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'content_update',
    jsonb_build_object(
        'test_type', 'polling_validation',
        'message', 'POLLING TEST - ' || EXTRACT(EPOCH FROM NOW()),
        'description', 'If Android TV receives this via HTTP polling, the system works!',
        'timestamp', NOW()::text,
        'system', 'reliable_http_polling'
    )
);

-- Step 4: Test the polling function directly
SELECT 
    '=== POLLING FUNCTION TEST ===' as section,
    id,
    change_type,
    change_timestamp,
    change_data->'message' as message,
    'Should be retrieved by Android TV polling' as expected
FROM get_device_notifications(
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    NOW() - INTERVAL '1 minute'
)
ORDER BY change_timestamp DESC
LIMIT 5;

-- Step 5: Show notification delivery expectations
SELECT 
    '=== POLLING DELIVERY EXPECTATIONS ===' as section,
    '15-30 seconds' as notification_delay,
    'HTTP polling (reliable)' as delivery_method,
    'No persistent connections' as connection_type,
    'Works on any network' as network_compatibility,
    'Android TV compatible' as device_compatibility,
    'Battle-tested approach' as reliability_rating;

-- Step 6: Monitor triggers are working
SELECT 
    '=== TRIGGER STATUS ===' as section,
    trigger_name,
    event_object_table,
    action_timing,
    'Simplified for polling system' as trigger_type
FROM information_schema.triggers 
WHERE event_object_table IN ('playlists', 'schedules')
ORDER BY event_object_table, trigger_name;