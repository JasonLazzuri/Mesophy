-- Install notification triggers for automatic playlist update notifications
-- Run this in Supabase SQL editor to enable automatic notifications

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
    AND s.is_active = true
    AND s.screen_id IS NOT NULL;

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
                    'playlist_name', COALESCE(NEW.name, OLD.name),
                    'trigger_source', 'playlist_update'
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
    AND s.is_active = true
    AND s.screen_id IS NOT NULL;

    -- Create notifications for each affected screen
    IF affected_screen_ids IS NOT NULL AND array_length(affected_screen_ids, 1) > 0 THEN
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
                    'order_index', COALESCE(NEW.order_index, OLD.order_index),
                    'trigger_source', 'playlist_items_change'
                ),
                3  -- Very high priority for playlist content changes
            );
        END LOOP;
    ELSE
        -- Log that no screens were affected (playlist not in use yet)
        RAISE NOTICE 'Playlist item % - no screens affected (playlist % not scheduled)', change_type, COALESCE(NEW.playlist_id, OLD.playlist_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create the triggers on the tables
DROP TRIGGER IF EXISTS playlists_notify_change ON playlists;
CREATE TRIGGER playlists_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlists
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_change();

DROP TRIGGER IF EXISTS playlist_items_notify_change ON playlist_items;
CREATE TRIGGER playlist_items_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_items_change();

-- Test the triggers by updating a playlist
UPDATE playlists 
SET updated_at = NOW()
WHERE id = (
    SELECT id FROM playlists 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
);

-- Verify triggers were installed and fired
SELECT 
    '=== VERIFICATION ===' as section,
    'Triggers installed successfully' as status;

-- Check if test notification was created
SELECT 
    '=== TEST NOTIFICATION ===' as section,
    notification_type,
    title,
    message,
    created_at,
    CASE 
        WHEN created_at > NOW() - INTERVAL '1 minute' THEN '✅ Just created by trigger test'
        ELSE '⚠️ Older notification'
    END as timing
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
ORDER BY created_at DESC
LIMIT 3;