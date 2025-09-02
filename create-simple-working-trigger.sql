-- Create simple, safe notification trigger for playlist updates
-- This version is minimal and won't break playlist functionality

-- Simple function that just creates a basic notification
CREATE OR REPLACE FUNCTION notify_simple_playlist_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only handle updates and deletes (not inserts to avoid noise)
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Create a simple notification for the Android TV screen
    -- We know it's linked to this specific screen ID from our earlier fix
    INSERT INTO device_notifications (
        screen_id,
        notification_type,
        title,
        message,
        priority
    ) VALUES (
        '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
        'playlist_change',
        CASE 
            WHEN TG_OP = 'UPDATE' THEN 'Playlist Updated'
            WHEN TG_OP = 'DELETE' THEN 'Playlist Deleted'
        END,
        CASE 
            WHEN TG_OP = 'UPDATE' THEN 'Playlist "' || NEW.name || '" has been updated'
            WHEN TG_OP = 'DELETE' THEN 'Playlist "' || OLD.name || '" has been deleted'
        END,
        2
    );

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    -- If anything goes wrong, don't break the playlist operation
    WHEN OTHERS THEN
        -- Log the error but don't fail the transaction
        RAISE WARNING 'Notification trigger failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Simple function for playlist items changes  
CREATE OR REPLACE FUNCTION notify_simple_playlist_items_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for any playlist item change
    INSERT INTO device_notifications (
        screen_id,
        notification_type,
        title,
        message,
        priority
    ) VALUES (
        '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
        'playlist_change',
        'Playlist Content Changed',
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'Media added to playlist'
            WHEN TG_OP = 'UPDATE' THEN 'Playlist media updated'
            WHEN TG_OP = 'DELETE' THEN 'Media removed from playlist'
        END,
        3
    );

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    -- If anything goes wrong, don't break the playlist operation
    WHEN OTHERS THEN
        RAISE WARNING 'Notification trigger failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Install the simple triggers
CREATE TRIGGER playlists_simple_notify
    AFTER UPDATE OR DELETE ON playlists
    FOR EACH ROW EXECUTE FUNCTION notify_simple_playlist_change();

CREATE TRIGGER playlist_items_simple_notify
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION notify_simple_playlist_items_change();

-- Test the playlist trigger
UPDATE playlists 
SET updated_at = NOW()
WHERE id = (
    SELECT id FROM playlists 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
);

-- Check if the trigger worked
SELECT 
    '=== TRIGGER TEST RESULT ===' as section,
    notification_type,
    title,
    message,
    created_at,
    CASE 
        WHEN created_at > NOW() - INTERVAL '1 minute' THEN '✅ Created by trigger'
        ELSE '⚠️ Older notification'  
    END as source
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
ORDER BY created_at DESC
LIMIT 3;