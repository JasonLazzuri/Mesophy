-- Test if the existing triggers are working
-- Since triggers exist but no notifications are created, let's debug why

-- Step 1: Check trigger details
SELECT 
    '=== EXISTING TRIGGERS ===' as section,
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_orientation,
    action_condition
FROM information_schema.triggers 
WHERE event_object_table IN ('playlists', 'playlist_items')
ORDER BY trigger_name;

-- Step 2: Force trigger a playlist update with explicit updated_at change
UPDATE playlists 
SET updated_at = NOW(),
    name = name || ''  -- Force a change without actually changing the name
WHERE is_active = true 
  AND id = (
    SELECT id FROM playlists 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
  );

-- Step 3: Check if ANY notifications exist for our screen (ever)
SELECT 
    '=== ALL NOTIFICATIONS EVER ===' as section,
    COUNT(*) as total_ever,
    MAX(created_at) as most_recent,
    MIN(created_at) as oldest
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid;

-- Step 4: Check if trigger just fired (should be within last 10 seconds)
SELECT 
    '=== IMMEDIATE TRIGGER TEST ===' as section,
    id,
    title,
    message,
    created_at,
    'Just created by trigger test' as source
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '30 seconds'
ORDER BY created_at DESC;

-- Step 5: Test manual notification insertion (to verify table works)
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'playlist_change',
    'Manual Test Notification',
    'Testing if direct insertion works - should appear immediately on Android TV',
    1
);

-- Step 6: Verify the manual notification was created
SELECT 
    '=== MANUAL NOTIFICATION TEST ===' as section,
    title,
    created_at,
    'Should appear on Android TV within seconds' as expected
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND title = 'Manual Test Notification';