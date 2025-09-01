-- Check if our database triggers are installed and active
SELECT 
    '=== INSTALLED TRIGGERS ===' as section,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%notify%'
ORDER BY event_object_table, trigger_name;

-- Check if our trigger functions exist
SELECT 
    '=== TRIGGER FUNCTIONS ===' as section,
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name LIKE '%notify%'
ORDER BY routine_name;

-- Test if triggers fire with a simple update
-- (We'll monitor notifications table before/after this)
SELECT 
    '=== BEFORE TEST UPDATE ===' as section,
    COUNT(*) as notification_count
FROM device_notifications
WHERE created_at >= NOW() - INTERVAL '1 minute';

-- Make a test update to playlist_items to see if trigger fires
UPDATE playlist_items 
SET duration_override = duration_override + 1
WHERE playlist_id = 'adbec30e-dfc5-4b9e-8478-de417c2c710d'
AND id = (
    SELECT id 
    FROM playlist_items 
    WHERE playlist_id = 'adbec30e-dfc5-4b9e-8478-de417c2c710d' 
    LIMIT 1
);

-- Check if notification was created by the trigger
SELECT 
    '=== AFTER TEST UPDATE ===' as section,
    COUNT(*) as notification_count,
    MAX(created_at) as latest_notification
FROM device_notifications
WHERE created_at >= NOW() - INTERVAL '1 minute';