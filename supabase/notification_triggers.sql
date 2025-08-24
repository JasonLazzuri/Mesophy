-- Database Triggers for Real-time Content Change Notifications
-- These triggers automatically create device notifications when content changes occur

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

-- Create the triggers

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