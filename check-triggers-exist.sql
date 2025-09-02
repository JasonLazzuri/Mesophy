-- Check if the notification triggers actually exist in the database

-- Check 1: Do the trigger functions exist?
SELECT 
    '=== TRIGGER FUNCTIONS ===' as section,
    proname as function_name,
    CASE 
        WHEN proname = 'notify_playlist_change' THEN '✅ Playlist trigger function exists'
        WHEN proname = 'notify_playlist_items_change' THEN '✅ Playlist items trigger function exists'  
        WHEN proname = 'notify_schedule_change' THEN '✅ Schedule trigger function exists'
        ELSE '❓ Other function: ' || proname
    END as status
FROM pg_proc 
WHERE proname LIKE 'notify_%_change'
ORDER BY proname;

-- Check 2: Are the triggers actually attached to the tables?
SELECT 
    '=== ACTIVE TRIGGERS ===' as section,
    trigger_name,
    event_object_table as table_name,
    action_timing,
    event_manipulation as trigger_event,
    CASE 
        WHEN trigger_name = 'playlists_notify_change' THEN '✅ Playlist trigger active'
        WHEN trigger_name = 'playlist_items_notify_change' THEN '✅ Playlist items trigger active'
        WHEN trigger_name = 'schedules_notify_change' THEN '✅ Schedule trigger active'
        ELSE '❓ Other trigger: ' || trigger_name
    END as status
FROM information_schema.triggers 
WHERE trigger_name LIKE '%notify_change'
ORDER BY trigger_name;

-- Check 3: Test if triggers are working by creating a test entry
-- First, let's see what playlists exist
SELECT 
    '=== EXISTING PLAYLISTS ===' as section,
    id,
    name,
    is_active,
    updated_at
FROM playlists 
ORDER BY created_at DESC
LIMIT 3;

-- We'll manually test the trigger in the next step if functions exist