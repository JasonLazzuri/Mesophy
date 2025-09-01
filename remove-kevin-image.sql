-- Remove the kevin image from Employee boards playlist
-- This image should not be displayed anymore based on user feedback

DELETE FROM playlist_items 
WHERE playlist_id = 'be229aa6-c0d0-432a-b8bf-648070bb2160' 
  AND media_asset_id = '22b6b12e-490f-41e6-a27a-684e72973b27';

-- Verify the deletion worked
SELECT 
    '=== EMPLOYEE BOARDS PLAYLIST AFTER DELETION ===' as section,
    pi.id,
    pi.order_index,
    pi.duration_override,
    ma.name as media_name,
    ma.mime_type
FROM playlist_items pi
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE pi.playlist_id = 'be229aa6-c0d0-432a-b8bf-648070bb2160'
ORDER BY pi.order_index;