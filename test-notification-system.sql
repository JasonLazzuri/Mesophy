-- Test the notification system to see if triggers are working
-- Run these queries in Supabase SQL Editor to diagnose the issue

-- 1. Check if device_notifications table has any data
SELECT 
    'Recent notifications' as test,
    COUNT(*) as notification_count,
    MAX(created_at) as latest_notification
FROM device_notifications;

-- 2. Check if triggers exist
SELECT 
    'Trigger status' as test,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name LIKE '%notify%'
ORDER BY trigger_name;

-- 3. Test manual notification creation (replace with your actual screen_id)
-- First, get your screen_id
SELECT 
    'Your screen ID' as info,
    id as screen_id,
    name as screen_name,
    device_type
FROM screens 
WHERE device_type LIKE '%tv%' OR device_type LIKE '%android%'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Test creating a notification manually (replace YOUR_SCREEN_ID with actual ID from above)
-- INSERT INTO device_notifications (
--     screen_id,
--     notification_type,
--     title,
--     message,
--     priority
-- ) VALUES (
--     'YOUR_SCREEN_ID'::uuid,
--     'system_message',
--     'Test notification',
--     'Testing real-time notifications',
--     3
-- );

-- 5. Check if notifications were delivered via SSE
-- SELECT 
--     'Notification delivery status' as test,
--     notification_type,
--     title,
--     created_at,
--     delivered_at,
--     CASE WHEN delivered_at IS NOT NULL THEN 'Delivered' ELSE 'Pending' END as status
-- FROM device_notifications 
-- ORDER BY created_at DESC
-- LIMIT 10;