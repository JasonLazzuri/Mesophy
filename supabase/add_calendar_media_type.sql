-- Add Calendar Media Type Support
-- Extends media_assets table to support calendar integrations as media items
-- This allows calendars to be managed like other media (images, videos) through playlists

-- Step 0: Create media_type enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
        CREATE TYPE media_type AS ENUM ('image', 'video', 'youtube');
        RAISE NOTICE 'Created media_type enum with default values';
    END IF;
END $$;

-- Step 1: Add 'calendar' to media_type enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'calendar'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_type')
    ) THEN
        ALTER TYPE media_type ADD VALUE 'calendar';
        RAISE NOTICE 'Added calendar value to media_type enum';
    ELSE
        RAISE NOTICE 'calendar value already exists in media_type enum';
    END IF;
END $$;

-- Step 2: Add calendar_metadata column to media_assets table
-- This stores all calendar-specific configuration as JSON
ALTER TABLE media_assets
ADD COLUMN IF NOT EXISTS calendar_metadata JSONB DEFAULT NULL;

-- Step 3: Create index for faster calendar metadata queries
CREATE INDEX IF NOT EXISTS idx_media_assets_calendar_metadata
ON media_assets USING GIN (calendar_metadata)
WHERE media_type = 'calendar';

-- Step 4: Update existing media_asset_source_check constraint to allow calendar type
-- The existing constraint requires file_url OR youtube_url, but calendars have neither
DO $$
BEGIN
    -- Drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'media_asset_source_check'
        AND conrelid = 'media_assets'::regclass
    ) THEN
        ALTER TABLE media_assets DROP CONSTRAINT media_asset_source_check;
        RAISE NOTICE 'Dropped old media_asset_source_check constraint';
    END IF;

    -- Add new constraint that allows calendar type
    ALTER TABLE media_assets
    ADD CONSTRAINT media_asset_source_check
    CHECK (
        (media_type::text = 'calendar' AND calendar_metadata IS NOT NULL) OR
        (file_url IS NOT NULL AND youtube_url IS NULL) OR
        (file_url IS NULL AND youtube_url IS NOT NULL)
    );
    RAISE NOTICE 'Added updated media_asset_source_check constraint with calendar support';
END $$;

-- Step 5: Add check constraint to ensure calendar media has required metadata
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_calendar_metadata'
        AND conrelid = 'media_assets'::regclass
    ) THEN
        ALTER TABLE media_assets
        ADD CONSTRAINT check_calendar_metadata
        CHECK (
          media_type::text != 'calendar' OR (
            calendar_metadata IS NOT NULL AND
            calendar_metadata ? 'provider' AND
            calendar_metadata ? 'calendar_id' AND
            calendar_metadata ? 'access_token' AND
            calendar_metadata ? 'refresh_token'
          )
        );
        RAISE NOTICE 'Added check_calendar_metadata constraint';
    ELSE
        RAISE NOTICE 'check_calendar_metadata constraint already exists';
    END IF;
END $$;

-- Step 5: Update existing columns to be nullable
-- (Calendar media doesn't have traditional file_url, file_path, etc.)
DO $$
BEGIN
    -- Make file_name nullable if it isn't already
    ALTER TABLE media_assets ALTER COLUMN file_name DROP NOT NULL;
    RAISE NOTICE 'file_name is now nullable';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'file_name was already nullable or does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE media_assets ALTER COLUMN file_path DROP NOT NULL;
    RAISE NOTICE 'file_path is now nullable';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'file_path was already nullable or does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE media_assets ALTER COLUMN file_url DROP NOT NULL;
    RAISE NOTICE 'file_url is now nullable';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'file_url was already nullable or does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE media_assets ALTER COLUMN mime_type DROP NOT NULL;
    RAISE NOTICE 'mime_type is now nullable';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'mime_type was already nullable or does not exist';
END $$;

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
