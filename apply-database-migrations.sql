-- =====================================================
-- MESOPHY REAL-TIME NOTIFICATION SYSTEM MIGRATION
-- =====================================================
-- 
-- This script sets up the complete real-time notification system
-- for instant content updates to Android TV devices.
--
-- Run these commands in your Supabase SQL Editor in order:
-- 1. First run the device_notifications_table.sql content
-- 2. Then run the notification_triggers.sql content
--
-- IMPORTANT: Take a database backup before running these migrations!
--

-- =====================================================
-- PART 1: DEVICE NOTIFICATIONS TABLE SETUP
-- =====================================================

-- Create notification types enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM (
            'schedule_change',      -- Schedule created/updated/deleted
            'playlist_change',      -- Playlist content modified
            'media_change',         -- Media asset updated/deleted
            'device_config_change', -- Device settings changed
            'system_message'        -- System-wide announcements
        );
    END IF;
END $$;

-- Device notifications table
CREATE TABLE IF NOT EXISTS device_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Target device/screen information
    screen_id UUID REFERENCES screens(id) ON DELETE CASCADE,
    device_id TEXT, -- Fallback for devices not yet paired to screens
    
    -- Notification details
    notification_type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    
    -- Related entity IDs for efficient querying
    schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    media_asset_id UUID REFERENCES media_assets(id) ON DELETE CASCADE,
    
    -- Payload for additional data (JSON format)
    payload JSONB DEFAULT '{}',
    
    -- Delivery tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    
    -- Priority (higher number = higher priority)
    priority INTEGER DEFAULT 1,
    
    -- TTL - auto-cleanup old notifications after 24 hours
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create indexes for efficient querying (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_device_notifications_screen_id ON device_notifications(screen_id);
CREATE INDEX IF NOT EXISTS idx_device_notifications_device_id ON device_notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_device_notifications_type ON device_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_device_notifications_created_at ON device_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_notifications_expires_at ON device_notifications(expires_at);

-- Composite index for device-specific queries
CREATE INDEX IF NOT EXISTS idx_device_notifications_screen_undelivered 
ON device_notifications(screen_id, created_at DESC) 
WHERE delivered_at IS NULL;

-- Auto-cleanup expired notifications (runs every hour)
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM device_notifications 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Enable cron extension if not exists (may require superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup function to run every hour (uncomment if pg_cron is available)
-- SELECT cron.schedule('cleanup-expired-notifications', '0 * * * *', 'SELECT cleanup_expired_notifications();');

-- Enable Row Level Security
ALTER TABLE device_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Devices can view their own notifications" ON device_notifications;
DROP POLICY IF EXISTS "Service role can manage all notifications" ON device_notifications;

-- RLS Policy: Devices can only see their own notifications
CREATE POLICY "Devices can view their own notifications" ON device_notifications
    FOR SELECT USING (
        screen_id IN (
            SELECT id FROM screens 
            WHERE device_id = current_setting('request.jwt.claims', true)::json->>'device_id'
        )
        OR device_id = current_setting('request.jwt.claims', true)::json->>'device_id'
    );

-- RLS Policy: Service role can manage all notifications
CREATE POLICY "Service role can manage all notifications" ON device_notifications
    FOR ALL USING (
        current_setting('role') = 'service_role'
        OR auth.jwt() ->> 'role' = 'service_role'
    );

-- Add comments for documentation
COMMENT ON TABLE device_notifications IS 'Real-time notifications for Android TV devices when content changes';
COMMENT ON COLUMN device_notifications.screen_id IS 'Target screen for the notification';
COMMENT ON COLUMN device_notifications.device_id IS 'Target device ID (for unpaired devices)';
COMMENT ON COLUMN device_notifications.payload IS 'Additional JSON data for the notification';
COMMENT ON COLUMN device_notifications.expires_at IS 'Automatic cleanup time for old notifications';

-- =====================================================
-- PART 2: NOTIFICATION TRIGGER FUNCTIONS
-- =====================================================

-- Function to notify affected screens when schedules change
CREATE OR REPLACE FUNCTION notify_schedule_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_id UUID;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    -- Determine change type and get screen_id
    CASE TG_OP
        WHEN 'INSERT' THEN
            change_type := 'created';
            notification_title := 'New schedule: ' || NEW.name;
            affected_screen_id := NEW.screen_id;
        WHEN 'UPDATE' THEN
            change_type := 'updated';
            notification_title := 'Schedule updated: ' || NEW.name;
            affected_screen_id := NEW.screen_id;
        WHEN 'DELETE' THEN
            change_type := 'deleted';
            notification_title := 'Schedule deleted: ' || OLD.name;
            affected_screen_id := OLD.screen_id;
    END CASE;

    -- Insert notification for the affected screen
    INSERT INTO device_notifications (
        screen_id,
        notification_type,
        title,
        message,
        schedule_id,
        payload,
        priority
    ) VALUES (
        affected_screen_id,
        'schedule_change',
        notification_title,
        'Schedule ' || change_type || ' - content may have changed',
        COALESCE(NEW.id, OLD.id),
        jsonb_build_object(
            'action', change_type,
            'schedule_name', COALESCE(NEW.name, OLD.name),
            'start_time', COALESCE(NEW.start_time, OLD.start_time),
            'end_time', COALESCE(NEW.end_time, OLD.end_time)
        ),
        2  -- High priority for schedule changes
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to notify affected screens when playlists change
CREATE OR REPLACE FUNCTION notify_playlist_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_ids UUID[];
    screen_id UUID;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    -- Determine change type
    CASE TG_OP
        WHEN 'INSERT' THEN
            change_type := 'created';
            notification_title := 'New playlist: ' || NEW.name;
        WHEN 'UPDATE' THEN
            change_type := 'updated';
            notification_title := 'Playlist updated: ' || NEW.name;
        WHEN 'DELETE' THEN
            change_type := 'deleted';
            notification_title := 'Playlist deleted: ' || OLD.name;
    END CASE;

    -- Find all screens that use this playlist
    SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
    FROM schedules s
    WHERE s.playlist_id = COALESCE(NEW.id, OLD.id)
    AND s.is_active = true;

    -- Create notifications for each affected screen
    IF affected_screen_ids IS NOT NULL THEN
        FOREACH screen_id IN ARRAY affected_screen_ids
        LOOP
            INSERT INTO device_notifications (
                screen_id,
                notification_type,
                title,
                message,
                playlist_id,
                payload,
                priority
            ) VALUES (
                screen_id,
                'playlist_change',
                notification_title,
                'Playlist ' || change_type || ' - content updated',
                COALESCE(NEW.id, OLD.id),
                jsonb_build_object(
                    'action', change_type,
                    'playlist_name', COALESCE(NEW.name, OLD.name)
                ),
                2  -- High priority for playlist changes
            );
        END LOOP;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to notify affected screens when playlist items change
CREATE OR REPLACE FUNCTION notify_playlist_items_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_ids UUID[];
    screen_id UUID;
    playlist_name TEXT;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    -- Get playlist name
    SELECT name INTO playlist_name
    FROM playlists
    WHERE id = COALESCE(NEW.playlist_id, OLD.playlist_id);

    -- Determine change type
    CASE TG_OP
        WHEN 'INSERT' THEN
            change_type := 'item_added';
            notification_title := 'Media added to: ' || playlist_name;
        WHEN 'UPDATE' THEN
            change_type := 'item_updated';
            notification_title := 'Media updated in: ' || playlist_name;
        WHEN 'DELETE' THEN
            change_type := 'item_removed';
            notification_title := 'Media removed from: ' || playlist_name;
    END CASE;

    -- Find all screens that use this playlist
    SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
    FROM schedules s
    WHERE s.playlist_id = COALESCE(NEW.playlist_id, OLD.playlist_id)
    AND s.is_active = true;

    -- Create notifications for each affected screen
    IF affected_screen_ids IS NOT NULL THEN
        FOREACH screen_id IN ARRAY affected_screen_ids
        LOOP
            INSERT INTO device_notifications (
                screen_id,
                notification_type,
                title,
                message,
                playlist_id,
                media_asset_id,
                payload,
                priority
            ) VALUES (
                screen_id,
                'playlist_change',
                notification_title,
                'Playlist content changed - display durations may be updated',
                COALESCE(NEW.playlist_id, OLD.playlist_id),
                COALESCE(NEW.media_asset_id, OLD.media_asset_id),
                jsonb_build_object(
                    'action', change_type,
                    'playlist_name', playlist_name,
                    'duration_override', COALESCE(NEW.duration_override, OLD.duration_override),
                    'order_index', COALESCE(NEW.order_index, OLD.order_index)
                ),
                3  -- Very high priority for playlist content changes
            );
        END LOOP;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to notify affected screens when media assets change
CREATE OR REPLACE FUNCTION notify_media_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_ids UUID[];
    screen_id UUID;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    -- Only process updates and deletes (inserts don't affect existing content)
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Determine change type
    CASE TG_OP
        WHEN 'UPDATE' THEN
            change_type := 'updated';
            notification_title := 'Media updated: ' || NEW.name;
        WHEN 'DELETE' THEN
            change_type := 'deleted';
            notification_title := 'Media deleted: ' || OLD.name;
    END CASE;

    -- Find all screens that use this media asset via playlist items
    SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
    FROM schedules s
    JOIN playlists p ON s.playlist_id = p.id
    JOIN playlist_items pi ON p.id = pi.playlist_id
    WHERE pi.media_asset_id = COALESCE(NEW.id, OLD.id)
    AND s.is_active = true;

    -- Create notifications for each affected screen
    IF affected_screen_ids IS NOT NULL THEN
        FOREACH screen_id IN ARRAY affected_screen_ids
        LOOP
            INSERT INTO device_notifications (
                screen_id,
                notification_type,
                title,
                message,
                media_asset_id,
                payload,
                priority
            ) VALUES (
                screen_id,
                'media_change',
                notification_title,
                'Media asset ' || change_type || ' - may need to re-download',
                COALESCE(NEW.id, OLD.id),
                jsonb_build_object(
                    'action', change_type,
                    'media_name', COALESCE(NEW.name, OLD.name),
                    'mime_type', COALESCE(NEW.mime_type, OLD.mime_type)
                ),
                1  -- Normal priority for media changes
            );
        END LOOP;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 3: CREATE TRIGGERS
-- =====================================================

-- Schedule change triggers
DROP TRIGGER IF EXISTS schedules_notify_change ON schedules;
CREATE TRIGGER schedules_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON schedules
    FOR EACH ROW EXECUTE FUNCTION notify_schedule_change();

-- Playlist change triggers
DROP TRIGGER IF EXISTS playlists_notify_change ON playlists;
CREATE TRIGGER playlists_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlists
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_change();

-- Playlist items change triggers
DROP TRIGGER IF EXISTS playlist_items_notify_change ON playlist_items;
CREATE TRIGGER playlist_items_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_items_change();

-- Media assets change triggers
DROP TRIGGER IF EXISTS media_assets_notify_change ON media_assets;
CREATE TRIGGER media_assets_notify_change
    AFTER UPDATE OR DELETE ON media_assets
    FOR EACH ROW EXECUTE FUNCTION notify_media_change();

-- Add comments for documentation
COMMENT ON FUNCTION notify_schedule_change() IS 'Automatically creates notifications when schedules are modified';
COMMENT ON FUNCTION notify_playlist_change() IS 'Automatically creates notifications when playlists are modified';
COMMENT ON FUNCTION notify_playlist_items_change() IS 'Automatically creates notifications when playlist content changes';
COMMENT ON FUNCTION notify_media_change() IS 'Automatically creates notifications when media assets are modified';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify table was created
SELECT 'device_notifications table created' as status 
WHERE EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'device_notifications'
);

-- Verify triggers were created
SELECT 'All triggers created successfully' as status
WHERE EXISTS (SELECT FROM information_schema.triggers WHERE trigger_name = 'schedules_notify_change')
  AND EXISTS (SELECT FROM information_schema.triggers WHERE trigger_name = 'playlists_notify_change')
  AND EXISTS (SELECT FROM information_schema.triggers WHERE trigger_name = 'playlist_items_notify_change')
  AND EXISTS (SELECT FROM information_schema.triggers WHERE trigger_name = 'media_assets_notify_change');

-- Show current notification functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name LIKE 'notify_%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- =====================================================
-- POST-MIGRATION TEST
-- =====================================================

-- Test notification creation (replace with actual screen_id from your database)
-- INSERT INTO device_notifications (
--     screen_id, 
--     notification_type, 
--     title, 
--     message, 
--     priority
-- ) VALUES (
--     'your-screen-id-here'::uuid, 
--     'system_message', 
--     'Real-time system activated', 
--     'Notification system is now active and ready to receive updates',
--     1
-- );

-- View recent notifications (for testing)
-- SELECT * FROM device_notifications ORDER BY created_at DESC LIMIT 5;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

SELECT 'Real-time notification system migration completed successfully!' as result;