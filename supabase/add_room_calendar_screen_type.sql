-- Migration: Add room_calendar screen type and related fields
-- Description: Adds support for Microsoft Outlook calendar integration for conference room displays
-- Date: 2025-01-03
--
-- IMPORTANT: This migration must be run in TWO separate transactions due to PostgreSQL enum limitations
--
-- OPTION 1: Run this entire file, then run the index creation separately
-- OPTION 2: Use the step-by-step instructions below

-- ============================================================================
-- STEP 1: Run this section first (add enum value)
-- ============================================================================

-- Add 'room_calendar' to the screen_type enum
-- Note: This must be committed before the enum value can be used in indexes
ALTER TYPE screen_type ADD VALUE IF NOT EXISTS 'room_calendar';

-- ============================================================================
-- STEP 2: Add table columns (can be in same transaction as STEP 1)
-- ============================================================================

-- Add room calendar specific fields to screens table
ALTER TABLE screens
  ADD COLUMN IF NOT EXISTS room_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cycle_interval_seconds INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS show_weather BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS weather_enabled BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN screens.room_image_url IS 'URL for room image displayed in split-screen calendar view';
COMMENT ON COLUMN screens.cycle_interval_seconds IS 'Interval in seconds for cycling between views (calendar, weather, etc.) to prevent screen burn-in';
COMMENT ON COLUMN screens.show_weather IS 'Whether to include weather view in the cycle';
COMMENT ON COLUMN screens.weather_enabled IS 'Whether weather integration has been configured for this screen';

-- ============================================================================
-- STEP 3: Run this section AFTER committing the above changes
-- Copy this section and run it as a separate query after the above is committed
-- ============================================================================
--
-- -- Create index for room_calendar screens for faster queries
-- CREATE INDEX IF NOT EXISTS idx_screens_room_calendar ON screens(screen_type) WHERE screen_type = 'room_calendar';

-- ============================================================================
-- Verification query (run this after all steps to verify changes)
-- ============================================================================
-- SELECT
--   id, name, screen_type, room_image_url, cycle_interval_seconds,
--   show_weather, weather_enabled
-- FROM screens
-- WHERE screen_type = 'room_calendar';
