-- Scalable notification triggers for multi-screen digital signage
-- This replaces the hardcoded single-screen triggers with dynamic notification routing
-- Works for unlimited screens by finding which screens should receive notifications

-- Remove old hardcoded triggers first
DROP TRIGGER IF EXISTS playlists_simple_notify ON playlists;
DROP TRIGGER IF EXISTS playlist_items_simple_notify ON playlist_items;
DROP FUNCTION IF EXISTS notify_simple_playlist_change();
DROP FUNCTION IF EXISTS notify_simple_playlist_items_change();

-- Function to create notifications for all screens using a specific playlist
CREATE OR REPLACE FUNCTION notify_playlist_change_to_all_screens()
RETURNS TRIGGER AS $$
DECLARE
    screen_record RECORD;
    playlist_name TEXT;
    notification_title TEXT;
    notification_message TEXT;
BEGIN
    -- Only handle updates and deletes (not inserts to avoid noise)
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Get playlist name for the notification
    playlist_name := COALESCE(NEW.name, OLD.name);
    
    -- Generate notification content based on operation
    IF TG_OP = 'UPDATE' THEN
        notification_title := 'Playlist Updated';
        notification_message := 'Playlist "' || playlist_name || '" has been updated';
    ELSIF TG_OP = 'DELETE' THEN
        notification_title := 'Playlist Deleted';
        notification_message := 'Playlist "' || playlist_name || '" has been deleted';
    END IF;

    -- Find all screens that use this playlist and create notifications
    FOR screen_record IN 
        SELECT DISTINCT s.id as screen_id, s.name as screen_name
        FROM screens s
        INNER JOIN schedules sch ON s.id = sch.screen_id
        WHERE sch.playlist_id = COALESCE(NEW.id, OLD.id)
          AND sch.is_active = true
          AND s.is_active = true
    LOOP
        -- Create notification for each screen that uses this playlist
        INSERT INTO device_notifications (
            screen_id,
            notification_type,
            title,
            message,
            priority,
            playlist_id
        ) VALUES (
            screen_record.screen_id,
            'playlist_change',
            notification_title,
            notification_message || ' (affects ' || screen_record.screen_name || ')',
            2,
            COALESCE(NEW.id, OLD.id)
        );
        
        RAISE LOG 'Created playlist notification for screen: % (%)', 
                  screen_record.screen_name, screen_record.screen_id;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- If anything goes wrong, don't break the playlist operation
        RAISE WARNING 'Playlist notification trigger failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to create notifications when playlist content changes
CREATE OR REPLACE FUNCTION notify_playlist_content_change_to_all_screens()
RETURNS TRIGGER AS $$
DECLARE
    screen_record RECORD;
    playlist_name TEXT;
    notification_title TEXT;
    notification_message TEXT;
    affected_playlist_id UUID;
BEGIN
    -- Get the playlist ID from the playlist_items record
    affected_playlist_id := COALESCE(NEW.playlist_id, OLD.playlist_id);
    
    -- Get playlist name for the notification
    SELECT name INTO playlist_name 
    FROM playlists 
    WHERE id = affected_playlist_id;
    
    -- Generate notification content based on operation
    notification_title := 'Playlist Content Changed';
    IF TG_OP = 'INSERT' THEN
        notification_message := 'Media added to playlist "' || playlist_name || '"';
    ELSIF TG_OP = 'UPDATE' THEN
        notification_message := 'Media updated in playlist "' || playlist_name || '"';
    ELSIF TG_OP = 'DELETE' THEN
        notification_message := 'Media removed from playlist "' || playlist_name || '"';
    END IF;

    -- Find all screens that use this playlist and create notifications
    FOR screen_record IN 
        SELECT DISTINCT s.id as screen_id, s.name as screen_name
        FROM screens s
        INNER JOIN schedules sch ON s.id = sch.screen_id
        WHERE sch.playlist_id = affected_playlist_id
          AND sch.is_active = true
          AND s.is_active = true
    LOOP
        -- Create notification for each screen that uses this playlist
        INSERT INTO device_notifications (
            screen_id,
            notification_type,
            title,
            message,
            priority,
            playlist_id
        ) VALUES (
            screen_record.screen_id,
            'playlist_change',
            notification_title,
            notification_message || ' (affects ' || screen_record.screen_name || ')',
            3,
            affected_playlist_id
        );
        
        RAISE LOG 'Created playlist content notification for screen: % (%)', 
                  screen_record.screen_name, screen_record.screen_id;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- If anything goes wrong, don't break the playlist operation
        RAISE WARNING 'Playlist content notification trigger failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Install the scalable triggers
CREATE TRIGGER playlists_scalable_notify
    AFTER UPDATE OR DELETE ON playlists
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_change_to_all_screens();

CREATE TRIGGER playlist_items_scalable_notify
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION notify_playlist_content_change_to_all_screens();

-- Optional: Schedule changes should also notify affected screens
CREATE OR REPLACE FUNCTION notify_schedule_change_to_screen()
RETURNS TRIGGER AS $$
DECLARE
    screen_name TEXT;
    playlist_name TEXT;
    notification_title TEXT;
    notification_message TEXT;
BEGIN
    -- Get screen and playlist names
    SELECT s.name INTO screen_name 
    FROM screens s 
    WHERE s.id = COALESCE(NEW.screen_id, OLD.screen_id);
    
    SELECT p.name INTO playlist_name 
    FROM playlists p 
    WHERE p.id = COALESCE(NEW.playlist_id, OLD.playlist_id);
    
    -- Generate notification content based on operation
    IF TG_OP = 'INSERT' THEN
        notification_title := 'Schedule Added';
        notification_message := 'New schedule created for playlist "' || playlist_name || '"';
    ELSIF TG_OP = 'UPDATE' THEN
        notification_title := 'Schedule Updated';
        notification_message := 'Schedule updated for playlist "' || playlist_name || '"';
    ELSIF TG_OP = 'DELETE' THEN
        notification_title := 'Schedule Removed';
        notification_message := 'Schedule removed for playlist "' || playlist_name || '"';
    END IF;

    -- Create notification for the affected screen
    INSERT INTO device_notifications (
        screen_id,
        notification_type,
        title,
        message,
        priority,
        schedule_id,
        playlist_id
    ) VALUES (
        COALESCE(NEW.screen_id, OLD.screen_id),
        'schedule_change',
        notification_title,
        notification_message || ' (affects ' || screen_name || ')',
        1,  -- High priority for schedule changes
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.playlist_id, OLD.playlist_id)
    );
    
    RAISE LOG 'Created schedule notification for screen: % (%)', 
              screen_name, COALESCE(NEW.screen_id, OLD.screen_id);

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- If anything goes wrong, don't break the schedule operation
        RAISE WARNING 'Schedule notification trigger failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Install schedule change trigger
CREATE TRIGGER schedules_scalable_notify
    AFTER INSERT OR UPDATE OR DELETE ON schedules
    FOR EACH ROW EXECUTE FUNCTION notify_schedule_change_to_screen();

-- Test the scalable triggers by updating a playlist
-- This should create notifications for ALL screens that use the playlist
DO $$
DECLARE
    test_playlist_id UUID;
    affected_screens INTEGER;
BEGIN
    -- Find any active playlist
    SELECT id INTO test_playlist_id 
    FROM playlists 
    WHERE id IN (
        SELECT DISTINCT playlist_id 
        FROM schedules 
        WHERE is_active = true
    )
    LIMIT 1;
    
    IF test_playlist_id IS NOT NULL THEN
        -- Count how many screens should be affected
        SELECT COUNT(DISTINCT s.id) INTO affected_screens
        FROM screens s
        INNER JOIN schedules sch ON s.id = sch.screen_id
        WHERE sch.playlist_id = test_playlist_id
          AND sch.is_active = true
          AND s.is_active = true;
          
        RAISE NOTICE 'Testing scalable triggers - playlist % should affect % screens', 
                     test_playlist_id, affected_screens;
        
        -- Trigger the notification by updating the playlist
        UPDATE playlists 
        SET updated_at = NOW()
        WHERE id = test_playlist_id;
        
        RAISE NOTICE 'Scalable trigger test completed - check device_notifications table';
    ELSE
        RAISE NOTICE 'No active playlists with schedules found for testing';
    END IF;
END $$;

-- Verify the scalable triggers worked
SELECT 
    '=== SCALABLE TRIGGER TEST RESULTS ===' as section,
    COUNT(*) as notifications_created,
    COUNT(DISTINCT screen_id) as screens_affected,
    STRING_AGG(DISTINCT title, ', ') as notification_types
FROM device_notifications 
WHERE created_at > NOW() - INTERVAL '1 minute';

-- Show recent notifications per screen
SELECT 
    '=== NOTIFICATIONS BY SCREEN ===' as section,
    s.name as screen_name,
    dn.title,
    dn.message,
    dn.created_at
FROM device_notifications dn
INNER JOIN screens s ON s.id = dn.screen_id
WHERE dn.created_at > NOW() - INTERVAL '1 minute'
ORDER BY dn.created_at DESC;