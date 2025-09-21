-- Fix the log_content_change function to handle empty screen arrays
-- This prevents NULL screen_id constraint violations when playlists aren't scheduled

CREATE OR REPLACE FUNCTION log_content_change(
    p_screen_ids UUID[],
    p_change_type TEXT,
    p_change_data JSONB DEFAULT '{}'
)
RETURNS INTEGER AS $$
DECLARE
    screen_id UUID;
    insert_count INTEGER := 0;
BEGIN
    -- Check if we have any screens to notify
    IF p_screen_ids IS NULL OR array_length(p_screen_ids, 1) IS NULL THEN
        RETURN 0; -- No screens to notify
    END IF;
    
    -- Insert notification for each affected screen
    FOREACH screen_id IN ARRAY p_screen_ids
    LOOP
        -- Additional safety check to ensure screen_id is not NULL
        IF screen_id IS NOT NULL THEN
            INSERT INTO device_notification_log (screen_id, change_type, change_data)
            VALUES (screen_id, p_change_type, p_change_data);
            insert_count := insert_count + 1;
        END IF;
    END LOOP;
    
    RETURN insert_count;
END;
$$ LANGUAGE plpgsql;

-- Test the fix by calling the function with an empty array
SELECT log_content_change(
    ARRAY[]::UUID[], 
    'test_change', 
    '{"test": true}'::jsonb
) as notifications_created;

-- Verify no new notifications were created
SELECT 
    '=== VERIFICATION ===' as section,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE change_type = 'test_change') as test_notifications
FROM device_notification_log;