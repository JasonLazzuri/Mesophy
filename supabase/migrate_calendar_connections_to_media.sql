-- Migrate Existing Calendar Connections to Media Assets
-- Converts screen-specific calendar_connections to organization-level calendar media assets
-- This enables calendars to be reused across multiple screens via playlists

-- Step 1: Insert calendar connections as media assets
INSERT INTO media_assets (
  id,
  organization_id,
  name,
  description,
  mime_type,
  media_type,
  calendar_metadata,
  is_active,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid() AS id,
  -- Get organization_id from the screen's location hierarchy
  (
    SELECT d.organization_id
    FROM screens s
    JOIN locations l ON s.location_id = l.id
    JOIN districts d ON l.district_id = d.id
    WHERE s.id = cc.screen_id
    LIMIT 1
  ) AS organization_id,
  -- Use calendar name or generate one from screen name
  COALESCE(cc.calendar_name, 'Calendar for ' || (SELECT name FROM screens WHERE id = cc.screen_id)) AS name,
  'Migrated from calendar_connections table' AS description,
  'application/calendar' AS mime_type,
  'calendar'::media_type AS media_type,
  -- Build calendar_metadata JSON from calendar_connections fields
  jsonb_build_object(
    'provider', cc.provider,
    'calendar_id', cc.calendar_id,
    'calendar_name', cc.calendar_name,
    'access_token', cc.access_token,
    'refresh_token', cc.refresh_token,
    'token_expires_at', cc.token_expires_at,
    'microsoft_user_id', cc.microsoft_user_id,
    'microsoft_email', cc.microsoft_email,
    'timezone', cc.timezone,
    'business_hours_start', cc.business_hours_start,
    'business_hours_end', cc.business_hours_end,
    'show_organizer', cc.show_organizer,
    'show_attendees', cc.show_attendees,
    'show_private_details', cc.show_private_details,
    'sync_status', cc.sync_status,
    'last_sync_at', cc.last_sync_at,
    'last_sync_error', cc.last_sync_error,
    'migrated_from_screen_id', cc.screen_id,  -- Track original screen for reference
    'migration_date', NOW()
  ) AS calendar_metadata,
  cc.is_active AS is_active,
  cc.created_by AS created_by,
  cc.created_at AS created_at,
  cc.updated_at AS updated_at
FROM calendar_connections cc
WHERE cc.calendar_id IS NOT NULL  -- Only migrate connections that have a calendar selected
ON CONFLICT DO NOTHING;

-- Step 2: Create a mapping table to track which media_assets replaced which calendar_connections
-- This is useful for reverting the migration if needed
CREATE TABLE IF NOT EXISTS calendar_migration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_calendar_connection_id UUID NOT NULL,
  new_media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  migrated_screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(old_calendar_connection_id)
);

-- Step 3: Populate migration log for tracking
INSERT INTO calendar_migration_log (
  old_calendar_connection_id,
  new_media_asset_id,
  migrated_screen_id
)
SELECT
  cc.id AS old_calendar_connection_id,
  ma.id AS new_media_asset_id,
  cc.screen_id AS migrated_screen_id
FROM calendar_connections cc
JOIN media_assets ma ON (ma.calendar_metadata->>'migrated_from_screen_id')::UUID = cc.screen_id
WHERE cc.calendar_id IS NOT NULL
AND ma.media_type = 'calendar'
AND ma.calendar_metadata->>'migrated_from_screen_id' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 4: Add comments for documentation
COMMENT ON TABLE calendar_migration_log IS 'Tracks migration of calendar_connections to media_assets for rollback capability';
COMMENT ON COLUMN calendar_migration_log.old_calendar_connection_id IS 'Original calendar_connections.id that was migrated';
COMMENT ON COLUMN calendar_migration_log.new_media_asset_id IS 'New media_assets.id created from migration';
COMMENT ON COLUMN calendar_migration_log.migrated_screen_id IS 'Screen that originally had this calendar connection';

-- Step 5: Print migration summary
DO $$
DECLARE
  migrated_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM calendar_connections;
  SELECT COUNT(*) INTO migrated_count FROM calendar_migration_log;

  RAISE NOTICE 'Calendar Migration Summary:';
  RAISE NOTICE '  Total calendar_connections: %', total_count;
  RAISE NOTICE '  Migrated to media_assets: %', migrated_count;
  RAISE NOTICE '  Not migrated (no calendar selected): %', total_count - migrated_count;
END $$;

-- NOTE: This migration does NOT delete calendar_connections table
-- After verifying the migration was successful, you can manually:
-- 1. Drop the calendar_connections table
-- 2. Remove old calendar-specific API endpoints
-- 3. Remove old calendar UI components from screen details page
