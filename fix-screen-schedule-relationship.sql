-- Fix the screen-schedule relationship issue
-- The affected_screen_ids showing [null] means schedules aren't linked to screens

-- 1. Check schedules table structure and data
SELECT 
    '=== SCHEDULES TABLE STRUCTURE ===' as section,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'schedules' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check actual schedule data
SELECT 
    '=== SCHEDULE DATA ===' as section,
    id,
    name,
    screen_id,
    playlist_id,
    is_active,
    created_at
FROM schedules
WHERE is_active = true
ORDER BY created_at DESC;

-- 3. Check screens table data  
SELECT 
    '=== SCREEN DATA ===' as section,
    id as screen_id,
    name as screen_name,
    created_at
FROM screens
ORDER BY created_at DESC;

-- 4. Check if there's a relationship between schedules and screens
SELECT 
    '=== SCHEDULE-SCREEN RELATIONSHIP ===' as section,
    s.id as schedule_id,
    s.name as schedule_name,
    s.screen_id,
    sc.name as screen_name,
    s.playlist_id,
    p.name as playlist_name
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id
LEFT JOIN playlists p ON s.playlist_id = p.id
WHERE s.is_active = true;

-- 5. If screen_id is null in schedules, we need to link them
-- Show schedules that need screen assignment
SELECT 
    '=== SCHEDULES MISSING SCREEN_ID ===' as section,
    id,
    name,
    screen_id,
    playlist_id
FROM schedules 
WHERE screen_id IS NULL AND is_active = true;

-- 6. If schedules have screen_id but screens don't exist, show orphaned schedules
SELECT 
    '=== ORPHANED SCHEDULES ===' as section,
    s.id,
    s.name,
    s.screen_id as missing_screen_id
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id
WHERE s.screen_id IS NOT NULL 
  AND sc.id IS NULL 
  AND s.is_active = true;