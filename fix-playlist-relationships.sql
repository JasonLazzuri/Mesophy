-- Fix playlist_items relationships - ensure all items are properly linked to playlists
-- This addresses the issue where playlist items exist but aren't properly connected

-- 1. First, check the current state of playlist_items relationships
SELECT 
    '=== PLAYLIST ITEMS WITH MISSING RELATIONSHIPS ===' as section,
    pi.id,
    pi.playlist_id,
    pi.media_asset_id,
    ma.name as media_name,
    CASE 
        WHEN pi.playlist_id IS NULL THEN 'ORPHANED - NO PLAYLIST ID'
        WHEN p.id IS NULL THEN 'BROKEN - PLAYLIST DOES NOT EXIST'
        ELSE 'OK'
    END as relationship_status
FROM playlist_items pi
LEFT JOIN playlists p ON pi.playlist_id = p.id
LEFT JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE pi.playlist_id IS NULL OR p.id IS NULL;

-- 2. Check all playlist_items to see their current playlist_id values
SELECT 
    '=== ALL PLAYLIST ITEMS ===' as section,
    pi.id,
    pi.playlist_id,
    p.name as playlist_name,
    ma.name as media_name,
    pi.order_index,
    pi.duration_override
FROM playlist_items pi
LEFT JOIN playlists p ON pi.playlist_id = p.id
LEFT JOIN media_assets ma ON pi.media_asset_id = ma.id
ORDER BY p.name, pi.order_index;

-- 3. Check if there are playlist_items that should be linked to your main playlists
-- but aren't properly connected

-- Get your main playlist IDs first
SELECT 
    '=== YOUR MAIN PLAYLISTS ===' as section,
    id,
    name,
    (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = p.id) as item_count
FROM playlists p
WHERE name IN ('Employee boards', 'Menu Board')
ORDER BY name;

-- 4. Fix orphaned playlist_items by connecting them to the right playlists
-- This is a safe approach - we'll identify items that should belong to each playlist

-- First, let's see if there are items that might belong to Employee boards
-- (based on the media assets we saw in the API response)
SELECT 
    '=== POTENTIAL EMPLOYEE BOARDS ITEMS ===' as section,
    pi.id,
    pi.playlist_id,
    ma.name as media_name,
    ma.id as media_asset_id
FROM playlist_items pi
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE ma.id IN (
    '22b6b12e-490f-41e6-a27a-684e72973b27',  -- kevin image
    'edd24d37-73b0-48e2-8ac9-e39cba5ff907',  -- screenshot
    '6f4043c5-5526-4c05-8b88-8de093b511da'   -- purple test
);

-- 5. Potential Menu Board items
SELECT 
    '=== POTENTIAL MENU BOARD ITEMS ===' as section,
    pi.id,
    pi.playlist_id,
    ma.name as media_name,
    ma.id as media_asset_id
FROM playlist_items pi
JOIN media_assets ma ON pi.media_asset_id = ma.id
WHERE ma.id IN (
    'a74f696a-abbd-4c7d-b5f0-f24cde3f2371',  -- Screenshot 2025-07-10 at 5.07.49 PM
    'edd24d37-73b0-48e2-8ac9-e39cba5ff907',  -- Screenshot 2025-07-04 at 8.19.34 AM
    '0b633208-ca7f-42b3-9c8d-dbc6c151a07a'   -- SampleVideo
);

-- 6. MANUAL FIXES (uncomment these after reviewing the results above)

-- If you want to remove the kevin image entirely:
-- DELETE FROM playlist_items 
-- WHERE media_asset_id = '22b6b12e-490f-41e6-a27a-684e72973b27';

-- If you want to remove the video entirely:
-- DELETE FROM playlist_items 
-- WHERE media_asset_id = '0b633208-ca7f-42b3-9c8d-dbc6c151a07a';

-- If playlist_items exist but have wrong playlist_id, fix them:
-- UPDATE playlist_items 
-- SET playlist_id = 'be229aa6-c0d0-432a-b8bf-648070bb2160'  -- Employee boards
-- WHERE media_asset_id IN (
--     'edd24d37-73b0-48e2-8ac9-e39cba5ff907',  -- screenshot you want to keep
--     '6f4043c5-5526-4c05-8b88-8de093b511da'   -- purple test
-- );

-- UPDATE playlist_items 
-- SET playlist_id = 'e9b2fe93-93d0-4857-b712-d12c0fd73d7e'  -- Menu Board  
-- WHERE media_asset_id IN (
--     'a74f696a-abbd-4c7d-b5f0-f24cde3f2371',  -- Screenshot 2025-07-10 at 5.07.49 PM
--     'edd24d37-73b0-48e2-8ac9-e39cba5ff907'   -- Screenshot 2025-07-04 at 8.19.34 AM (if you want it on menu board)
-- );

-- 7. After making changes, verify the final state
-- SELECT 
--     '=== FINAL PLAYLIST STATE ===' as section,
--     p.name as playlist_name,
--     pi.order_index,
--     pi.duration_override,
--     ma.name as media_name,
--     pi.playlist_id
-- FROM playlist_items pi
-- JOIN playlists p ON pi.playlist_id = p.id
-- JOIN media_assets ma ON pi.media_asset_id = ma.id
-- WHERE p.name IN ('Employee boards', 'Menu Board')
-- ORDER BY p.name, pi.order_index;