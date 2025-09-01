-- Create a more complete test notification that matches the expected SSE format
INSERT INTO device_notifications (
    screen_id,
    notification_type,
    title,
    message,
    playlist_id,
    priority,
    payload
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed',  -- Your screen ID
    'playlist_change',
    'Complete Test Notification',
    'Testing SSE delivery with complete notification format',
    'adbec30e-dfc5-4b9e-8478-de417c2c710d',  -- Your current playlist ID from the logs
    2,
    jsonb_build_object(
        'action', 'test',
        'playlist_name', 'Menu Board 1'
    )
);