-- Comprehensive fix for playlist notification system
-- This addresses the issue where playlist updates don't trigger notifications to Android TV

-- ========================================
-- STEP 1: DIAGNOSE THE CURRENT STATE
-- ========================================

-- Check screen information
SELECT 
    '=== SCREEN INFO ===' as section,
    id as screen_id,
    name as screen_name,
    device_type,
    is_active,
    created_at
FROM screens 
WHERE id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid;

-- Check current schedule-screen relationships
SELECT 
    '=== CURRENT SCHEDULES ===' as section,
    s.id as schedule_id,
    s.name as schedule_name,
    s.screen_id,
    s.playlist_id,
    s.is_active,
    p.name as playlist_name
FROM schedules s
LEFT JOIN playlists p ON s.playlist_id = p.id
ORDER BY s.is_active DESC, s.created_at DESC;

-- Check if there are any recent notifications
SELECT 
    '=== RECENT NOTIFICATIONS ===' as section,
    screen_id,
    notification_type,
    title,
    created_at
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- STEP 2: FIX SCHEDULE-SCREEN RELATIONSHIPS
-- ========================================

-- Link all active schedules to the Android TV screen
UPDATE schedules 
SET screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
WHERE screen_id IS NULL 
  AND is_active = true;

-- Verify the fix worked
SELECT 
    '=== SCHEDULES AFTER FIX ===' as section,
    s.id as schedule_id,
    s.name as schedule_name,
    s.screen_id,
    s.is_active,
    p.name as playlist_name,
    CASE 
        WHEN s.screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid THEN '✅ LINKED TO ANDROID TV'
        WHEN s.screen_id IS NULL THEN '❌ NOT LINKED'
        ELSE '⚠️ LINKED TO OTHER SCREEN'
    END as link_status
FROM schedules s
LEFT JOIN playlists p ON s.playlist_id = p.id
WHERE s.is_active = true
ORDER BY s.name;

-- ========================================
-- STEP 3: TEST NOTIFICATION TRIGGERS
-- ========================================

-- Create a manual test notification to verify SSE delivery
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority,
    payload
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'system_message',
    'Manual test after schedule fix',
    'Testing if notifications now work after linking schedules',
    3,
    '{"test_type": "manual", "fix_applied": "schedule_linking"}'::jsonb
);

-- Test playlist trigger by updating a playlist
-- (This simulates what happens when you edit a playlist in the dashboard)
UPDATE playlists 
SET updated_at = NOW()
WHERE is_active = true
LIMIT 1;

-- Test playlist items trigger by updating a playlist item
-- (This simulates adding/removing/reordering media in a playlist)
UPDATE playlist_items 
SET updated_at = NOW()
WHERE id IN (
    SELECT pi.id 
    FROM playlist_items pi
    JOIN playlists p ON pi.playlist_id = p.id
    WHERE p.is_active = true
    LIMIT 1
);

-- ========================================
-- STEP 4: VERIFY NOTIFICATIONS WERE CREATED
-- ========================================

-- Check if our test notifications were created
SELECT 
    '=== NEW NOTIFICATIONS AFTER TESTS ===' as section,
    screen_id,
    notification_type,
    title,
    message,
    created_at,
    payload
FROM device_notifications 
WHERE screen_id = '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid
  AND created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC;

-- ========================================
-- STEP 5: CREATE FINAL TEST FOR USER
-- ========================================

-- Create a clear notification that should appear on Android TV logs
INSERT INTO device_notifications (
    screen_id,
    notification_type, 
    title,
    message,
    priority,
    payload
) VALUES (
    '003a361b-681d-4299-8337-bd7e5c09d1ed'::uuid,
    'playlist_change',
    'Playlist Update Test',
    'If you see this in Android TV logs, notifications are working!',
    3,
    '{"action": "test", "message": "Playlist notifications are now functional"}'::jsonb
);

-- Show summary of what should happen next
SELECT 
    '=== WHAT TO EXPECT ===' as section,
    'Check Android TV logs for notifications' as action,
    'Look for SSE events with playlist_change or system_message' as details,
    'If working, you should see notifications within 2-5 seconds' as timing;