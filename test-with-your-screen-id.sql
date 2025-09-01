-- Test notifications with your confirmed screen ID: 003a361b-681d-4299-8337-bd7e5c09d1ed

-- 1. Create a manual test notification (should appear in Android logs immediately)
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'system_message',
    'Real-time test',
    'Testing SSE delivery to your Android TV',
    3
);

-- 2. Check if notification was created
SELECT 
    'Manual notification created' as status,
    notification_type,
    title, 
    message,
    created_at
FROM device_notifications
ORDER BY created_at DESC
LIMIT 3;

-- 3. Check if schedules are now properly linked
SELECT 
    'Schedule relationships' as status,
    s.name as schedule_name,
    s.screen_id,
    CASE 
        WHEN s.screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN 'LINKED ✅'
        WHEN s.screen_id IS NULL THEN 'NOT LINKED ❌'
        ELSE 'WRONG SCREEN ❌'
    END as link_status
FROM schedules s
WHERE s.is_active = true;