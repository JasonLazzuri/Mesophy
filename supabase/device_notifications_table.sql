-- Device Notifications Table for Real-time Content Updates
-- This table enables real-time push notifications to Android TV devices
-- when content changes, eliminating the need for frequent polling.

-- Create notification types enum
CREATE TYPE notification_type AS ENUM (
    'schedule_change',      -- Schedule created/updated/deleted
    'playlist_change',      -- Playlist content modified
    'media_change',         -- Media asset updated/deleted
    'device_config_change', -- Device settings changed
    'system_message'        -- System-wide announcements
);

-- Device notifications table
CREATE TABLE device_notifications (
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

-- Indexes for efficient querying
CREATE INDEX idx_device_notifications_screen_id ON device_notifications(screen_id);
CREATE INDEX idx_device_notifications_device_id ON device_notifications(device_id);
CREATE INDEX idx_device_notifications_type ON device_notifications(notification_type);
CREATE INDEX idx_device_notifications_created_at ON device_notifications(created_at DESC);
CREATE INDEX idx_device_notifications_expires_at ON device_notifications(expires_at);

-- Composite index for device-specific queries
CREATE INDEX idx_device_notifications_screen_undelivered 
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

-- Schedule the cleanup function to run every hour
SELECT cron.schedule('cleanup-expired-notifications', '0 * * * *', 'SELECT cleanup_expired_notifications();');

-- Enable Row Level Security
ALTER TABLE device_notifications ENABLE ROW LEVEL SECURITY;

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

-- Comments for documentation
COMMENT ON TABLE device_notifications IS 'Real-time notifications for Android TV devices when content changes';
COMMENT ON COLUMN device_notifications.screen_id IS 'Target screen for the notification';
COMMENT ON COLUMN device_notifications.device_id IS 'Target device ID (for unpaired devices)';
COMMENT ON COLUMN device_notifications.payload IS 'Additional JSON data for the notification';
COMMENT ON COLUMN device_notifications.expires_at IS 'Automatic cleanup time for old notifications';