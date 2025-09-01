-- Manually insert a test notification to verify SSE delivery system is working
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    priority
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed',  -- Your screen ID from the logs
    'playlist_change',
    'Test Duration Update',
    'Testing if real-time notifications are working after playlist changes',
    2
);