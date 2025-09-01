-- Check the current state of your playlists in the database
-- This will show what the database actually contains vs what you see in the dashboard

-- 1. Employee boards playlist items (what Android is receiving)
SELECT 
    '=== EMPLOYEE BOARDS PLAYLIST ITEMS ===' as section,
    pi.id,
    pi.order_index,
    pi.duration_override,
    ma.name as media_name,
    ma.mime_type
FROM playlist_items pi
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE pi.playlist_id = 'be229aa6-c0d0-432a-b8bf-648070bb2160'
ORDER BY pi.order_index;

-- 2. Menu Board playlist items
SELECT 
    '=== MENU BOARD PLAYLIST ITEMS ===' as section,
    pi.id,
    pi.order_index,
    pi.duration_override,
    ma.name as media_name,
    ma.mime_type
FROM playlist_items pi
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE pi.playlist_id = 'e9b2fe93-93d0-4857-b712-d12c0fd73d7e'
ORDER BY pi.order_index;

-- 3. If you want to manually remove the kevin image and video:
-- REMOVE KEVIN IMAGE:
-- DELETE FROM playlist_items 
-- WHERE playlist_id = 'be229aa6-c0d0-432a-b8bf-648070bb2160' 
--   AND media_asset_id = '22b6b12e-490f-41e6-a27a-684e72973b27';

-- REMOVE VIDEO:
-- DELETE FROM playlist_items 
-- WHERE playlist_id = 'e9b2fe93-93d0-4857-b712-d12c0fd73d7e' 
--   AND media_asset_id = '0b633208-ca7f-42b3-9c8d-dbc6c151a07a';

-- 4. After deleting, verify the playlist contents
-- SELECT 
--     'After manual deletion' as section,
--     pi.id,
--     ma.name as media_name
-- FROM playlist_items pi
-- JOIN media_assets ma ON pi.media_asset_id = ma.id
-- WHERE pi.playlist_id IN (
--     'be229aa6-c0d0-432a-b8bf-648070bb2160',  -- Employee boards
--     'e9b2fe93-93d0-4857-b712-d12c0fd73d7e'   -- Menu Board
-- )
-- ORDER BY pi.playlist_id, pi.order_index;