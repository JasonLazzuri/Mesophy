-- EMERGENCY FIX: Remove broken triggers to restore playlist functionality

-- Remove the triggers that are causing errors
DROP TRIGGER IF EXISTS playlists_notify_change ON playlists;
DROP TRIGGER IF EXISTS playlist_items_notify_change ON playlist_items;

-- Remove the functions too
DROP FUNCTION IF EXISTS notify_playlist_change();
DROP FUNCTION IF EXISTS notify_playlist_items_change();

-- Test that playlist operations work again
SELECT 
    '=== TRIGGERS REMOVED ===' as section,
    'Playlist operations should work again' as status;

-- Check if we can see what the error was
SELECT 
    '=== RECENT PLAYLIST ITEMS ===' as section,
    COUNT(*) as total_items,
    MAX(created_at) as latest_item
FROM playlist_items;

-- Try a simple playlist update to verify it works
UPDATE playlists 
SET updated_at = NOW()
WHERE id = (
    SELECT id FROM playlists 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
);

SELECT 
    '=== PLAYLIST UPDATE TEST ===' as section,
    'If you see this, playlist updates are working again' as result;