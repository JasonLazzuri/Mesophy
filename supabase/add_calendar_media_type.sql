-- Add Calendar Media Type Support
-- Extends media_assets table to support calendar integrations as media items
-- This allows calendars to be managed like other media (images, videos) through playlists

-- Step 1: Add 'calendar' to media_type enum
ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'calendar';

-- Step 2: Add calendar_metadata column to media_assets table
-- This stores all calendar-specific configuration as JSON
ALTER TABLE media_assets
ADD COLUMN IF NOT EXISTS calendar_metadata JSONB DEFAULT NULL;

-- Step 3: Create index for faster calendar metadata queries
CREATE INDEX IF NOT EXISTS idx_media_assets_calendar_metadata
ON media_assets USING GIN (calendar_metadata)
WHERE media_type = 'calendar';

-- Step 4: Add check constraint to ensure calendar media has required metadata
ALTER TABLE media_assets
ADD CONSTRAINT check_calendar_metadata
CHECK (
  media_type != 'calendar' OR (
    calendar_metadata IS NOT NULL AND
    calendar_metadata ? 'provider' AND
    calendar_metadata ? 'calendar_id' AND
    calendar_metadata ? 'access_token' AND
    calendar_metadata ? 'refresh_token'
  )
);

-- Step 5: Update existing calendar media type to be nullable
-- (Calendar media doesn't have traditional file_url, file_path, etc.)
ALTER TABLE media_assets
ALTER COLUMN file_name DROP NOT NULL,
ALTER COLUMN file_path DROP NOT NULL,
ALTER COLUMN file_url DROP NOT NULL,
ALTER COLUMN mime_type DROP NOT NULL;

-- Step 6: Add comments for documentation
COMMENT ON COLUMN media_assets.calendar_metadata IS 'JSON metadata for calendar media type. Contains provider, calendar_id, access_token, refresh_token, timezone, business_hours, and display settings.';

-- Step 7: Create helper function to validate calendar metadata structure
CREATE OR REPLACE FUNCTION validate_calendar_metadata(metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Ensure required fields are present
  IF NOT (
    metadata ? 'provider' AND
    metadata ? 'calendar_id' AND
    metadata ? 'access_token' AND
    metadata ? 'refresh_token' AND
    metadata ? 'token_expires_at'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Ensure provider is valid
  IF metadata->>'provider' NOT IN ('microsoft', 'google') THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_calendar_metadata IS 'Validates that calendar metadata JSON has required fields and correct structure';

-- Example calendar metadata structure:
-- {
--   "provider": "microsoft",
--   "calendar_id": "AAMkAD...",
--   "calendar_name": "Conference Room A",
--   "access_token": "eyJ0eX...",
--   "refresh_token": "0.AScA...",
--   "token_expires_at": "2025-11-05T12:00:00Z",
--   "microsoft_user_id": "abcd...",
--   "microsoft_email": "user@example.com",
--   "timezone": "America/Los_Angeles",
--   "business_hours_start": "08:00:00",
--   "business_hours_end": "18:00:00",
--   "show_organizer": true,
--   "show_attendees": false,
--   "show_private_details": false,
--   "sync_status": "active",
--   "last_sync_at": "2025-11-05T11:00:00Z",
--   "last_sync_error": null
-- }
