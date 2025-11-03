-- Migration: Add room_calendar screen type - STEP 3 (Index Creation)
-- Description: Creates index for room_calendar screens
-- Date: 2025-01-03
--
-- IMPORTANT: Run this AFTER running add_room_calendar_screen_type.sql and committing the transaction
--
-- This must be run separately because PostgreSQL requires enum values to be committed
-- before they can be used in index predicates.

-- Create index for room_calendar screens for faster queries
CREATE INDEX IF NOT EXISTS idx_screens_room_calendar ON screens(screen_type) WHERE screen_type = 'room_calendar';

-- Verify index was created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'screens'
  AND indexname = 'idx_screens_room_calendar';
