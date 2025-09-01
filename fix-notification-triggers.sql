-- Fix for notification triggers causing playlist item insertion failures
-- Run this in Supabase SQL Editor to fix the triggers

-- Drop the existing triggers to stop the errors
DROP TRIGGER IF EXISTS playlist_items_notify_change ON playlist_items;

-- Recreate the playlist items notification function with error handling
CREATE OR REPLACE FUNCTION notify_playlist_items_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_ids UUID[];
    screen_id UUID;
    playlist_name TEXT;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    -- Add error handling and logging
    BEGIN
        -- Get playlist name
        SELECT name INTO playlist_name
        FROM playlists
        WHERE id = COALESCE(NEW.playlist_id, OLD.playlist_id);

        -- Determine change type
        CASE TG_OP
            WHEN 'INSERT' THEN
                change_type := 'item_added';
                notification_title := 'Media added to: ' || COALESCE(playlist_name, 'Unknown Playlist');
            WHEN 'UPDATE' THEN
                change_type := 'item_updated';
                notification_title := 'Media updated in: ' || COALESCE(playlist_name, 'Unknown Playlist');
            WHEN 'DELETE' THEN
                change_type := 'item_removed';
                notification_title := 'Media removed from: ' || COALESCE(playlist_name, 'Unknown Playlist');
        END CASE;

        -- Find all screens that use this playlist
        SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
        FROM schedules s
        WHERE s.playlist_id = COALESCE(NEW.playlist_id, OLD.playlist_id)
        AND s.is_active = true;

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
                        'playlist_name', COALESCE(playlist_name, 'Unknown'),
                        'duration_override', COALESCE(NEW.duration_override, OLD.duration_override),
                        'order_index', COALESCE(NEW.order_index, OLD.order_index)
                    ),
                    3  -- Very high priority for playlist content changes
                );
            END LOOP;
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail the original operation
            RAISE WARNING 'notify_playlist_items_change failed: %', SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with the fixed function
CREATE TRIGGER playlist_items_notify_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_items_change();

-- Also add error handling to the other trigger functions

-- Fix schedule change function
CREATE OR REPLACE FUNCTION notify_schedule_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_id UUID;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    BEGIN
        -- Determine change type and get screen_id
        CASE TG_OP
            WHEN 'INSERT' THEN
                change_type := 'created';
                notification_title := 'New schedule: ' || COALESCE(NEW.name, 'Unnamed');
                affected_screen_id := NEW.screen_id;
            WHEN 'UPDATE' THEN
                change_type := 'updated';
                notification_title := 'Schedule updated: ' || COALESCE(NEW.name, 'Unnamed');
                affected_screen_id := NEW.screen_id;
            WHEN 'DELETE' THEN
                change_type := 'deleted';
                notification_title := 'Schedule deleted: ' || COALESCE(OLD.name, 'Unnamed');
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

    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'notify_schedule_change failed: %', SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Fix playlist change function
CREATE OR REPLACE FUNCTION notify_playlist_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_screen_ids UUID[];
    screen_id UUID;
    notification_title TEXT;
    change_type TEXT;
BEGIN
    BEGIN
        -- Determine change type
        CASE TG_OP
            WHEN 'INSERT' THEN
                change_type := 'created';
                notification_title := 'New playlist: ' || COALESCE(NEW.name, 'Unnamed');
            WHEN 'UPDATE' THEN
                change_type := 'updated';
                notification_title := 'Playlist updated: ' || COALESCE(NEW.name, 'Unnamed');
            WHEN 'DELETE' THEN
                change_type := 'deleted';
                notification_title := 'Playlist deleted: ' || COALESCE(OLD.name, 'Unnamed');
        END CASE;

        -- Find all screens that use this playlist
        SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
        FROM schedules s
        WHERE s.playlist_id = COALESCE(NEW.id, OLD.id)
        AND s.is_active = true;

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

    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'notify_playlist_change failed: %', SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Fix media change function
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

    BEGIN
        -- Determine change type
        CASE TG_OP
            WHEN 'UPDATE' THEN
                change_type := 'updated';
                notification_title := 'Media updated: ' || COALESCE(NEW.name, 'Unnamed');
            WHEN 'DELETE' THEN
                change_type := 'deleted';
                notification_title := 'Media deleted: ' || COALESCE(OLD.name, 'Unnamed');
        END CASE;

        -- Find all screens that use this media asset via playlist items
        SELECT ARRAY_AGG(DISTINCT s.screen_id) INTO affected_screen_ids
        FROM schedules s
        JOIN playlists p ON s.playlist_id = p.id
        JOIN playlist_items pi ON p.id = pi.playlist_id
        WHERE pi.media_asset_id = COALESCE(NEW.id, OLD.id)
        AND s.is_active = true;

        -- Create notifications for each affected screen
        IF affected_screen_ids IS NOT NULL AND array_length(affected_screen_ids, 1) > 0 THEN
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

    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'notify_media_change failed: %', SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Test the fixes
SELECT 'Notification triggers updated with error handling' as status;