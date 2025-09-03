-- Complete polling-based notification system to replace failing SSE
-- This creates a simple, reliable notification delivery mechanism

-- Step 1: Create simple notification log table
CREATE TABLE IF NOT EXISTS device_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES screens(id),
    change_type TEXT NOT NULL CHECK (change_type IN ('playlist_change', 'schedule_change', 'content_update')),
    change_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_data JSONB NOT NULL DEFAULT '{}',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_device_notification_log_screen_timestamp 
ON device_notification_log (screen_id, change_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_device_notification_log_unprocessed 
ON device_notification_log (screen_id, processed_at) WHERE processed_at IS NULL;

-- Step 2: Simple function to log content changes (replaces complex triggers)
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
    -- Insert notification for each affected screen
    FOREACH screen_id IN ARRAY p_screen_ids
    LOOP
        INSERT INTO device_notification_log (screen_id, change_type, change_data)
        VALUES (screen_id, p_change_type, p_change_data);
        insert_count := insert_count + 1;
    END LOOP;
    
    RETURN insert_count;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Replace complex playlist triggers with simple notification creation
DROP TRIGGER IF EXISTS playlist_changes_trigger ON playlists;
DROP TRIGGER IF EXISTS playlist_item_changes_trigger ON playlist_items;
DROP TRIGGER IF EXISTS schedule_changes_trigger ON schedules;

-- Simple playlist change trigger
CREATE OR REPLACE FUNCTION notify_playlist_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screens UUID[];
BEGIN
    -- Get all screens that use this playlist (via schedules)
    SELECT array_agg(DISTINCT s.screen_id)
    INTO affected_screens
    FROM schedules s
    WHERE s.playlist_id = COALESCE(NEW.id, OLD.id)
    AND s.is_active = true;
    
    -- Log notification for affected screens
    IF array_length(affected_screens, 1) > 0 THEN
        PERFORM log_content_change(
            affected_screens,
            'playlist_change',
            jsonb_build_object(
                'playlist_id', COALESCE(NEW.id, OLD.id),
                'action', CASE 
                    WHEN TG_OP = 'INSERT' THEN 'created'
                    WHEN TG_OP = 'UPDATE' THEN 'updated'
                    WHEN TG_OP = 'DELETE' THEN 'deleted'
                END,
                'playlist_name', COALESCE(NEW.name, OLD.name)
            )
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Simple schedule change trigger
CREATE OR REPLACE FUNCTION notify_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Log notification for the specific screen
    PERFORM log_content_change(
        ARRAY[COALESCE(NEW.screen_id, OLD.screen_id)],
        'schedule_change',
        jsonb_build_object(
            'schedule_id', COALESCE(NEW.id, OLD.id),
            'playlist_id', COALESCE(NEW.playlist_id, OLD.playlist_id),
            'action', CASE 
                WHEN TG_OP = 'INSERT' THEN 'created'
                WHEN TG_OP = 'UPDATE' THEN 'updated'
                WHEN TG_OP = 'DELETE' THEN 'deleted'
            END
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create simple triggers
CREATE TRIGGER playlist_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON playlists
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_change();

CREATE TRIGGER schedule_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON schedules
    FOR EACH ROW EXECUTE FUNCTION notify_schedule_change();

-- Step 4: Function to get pending notifications for a device
CREATE OR REPLACE FUNCTION get_device_notifications(
    p_screen_id UUID,
    p_since_timestamp TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    change_type TEXT,
    change_timestamp TIMESTAMPTZ,
    change_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dnl.id,
        dnl.change_type,
        dnl.change_timestamp,
        dnl.change_data
    FROM device_notification_log dnl
    WHERE dnl.screen_id = p_screen_id
    AND (p_since_timestamp IS NULL OR dnl.change_timestamp > p_since_timestamp)
    AND dnl.processed_at IS NULL
    ORDER BY dnl.change_timestamp DESC
    LIMIT 50; -- Prevent overwhelming the client
END;
$$ LANGUAGE plpgsql;

-- Step 5: Function to mark notifications as processed
CREATE OR REPLACE FUNCTION mark_notifications_processed(
    p_notification_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
    update_count INTEGER;
BEGIN
    UPDATE device_notification_log
    SET processed_at = NOW()
    WHERE id = ANY(p_notification_ids)
    AND processed_at IS NULL;
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RETURN update_count;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Cleanup old processed notifications (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    delete_count INTEGER;
BEGIN
    -- Delete processed notifications older than 7 days
    DELETE FROM device_notification_log
    WHERE processed_at IS NOT NULL
    AND processed_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RETURN delete_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for API access
GRANT SELECT, INSERT, UPDATE ON device_notification_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_processed TO authenticated;

-- Insert test notification to verify system works
INSERT INTO device_notification_log (screen_id, change_type, change_data)
VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'content_update',
    jsonb_build_object(
        'message', 'Polling notification system initialized - ' || EXTRACT(EPOCH FROM NOW()),
        'system_status', 'ready'
    )
);

-- Show system status
SELECT 
    '=== POLLING NOTIFICATION SYSTEM STATUS ===' as section,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE processed_at IS NULL) as pending_notifications,
    MAX(created_at) as latest_notification
FROM device_notification_log;