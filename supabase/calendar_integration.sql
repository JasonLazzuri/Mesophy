-- Calendar Integration Schema for Microsoft Outlook
-- Enables screens to display room calendar information with real-time availability

-- Table: calendar_connections
-- Stores OAuth credentials and calendar configuration per screen
CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,

  -- Calendar Provider Info
  provider VARCHAR(50) NOT NULL DEFAULT 'microsoft', -- 'microsoft', 'google' (future)
  calendar_id VARCHAR(255), -- Microsoft Graph calendar ID (e.g., room calendar)
  calendar_name VARCHAR(255), -- Friendly name of the calendar

  -- Microsoft OAuth Credentials (encrypted at rest)
  access_token TEXT, -- OAuth access token for Microsoft Graph API
  refresh_token TEXT, -- OAuth refresh token for renewing access
  token_expires_at TIMESTAMPTZ, -- When the access token expires

  -- Microsoft Account Info
  microsoft_user_id VARCHAR(255), -- Microsoft account ID
  microsoft_email VARCHAR(255), -- Email address of the connected account

  -- Configuration
  is_active BOOLEAN DEFAULT true,
  timezone VARCHAR(100) DEFAULT 'America/Los_Angeles', -- Calendar timezone

  -- Display Settings
  show_organizer BOOLEAN DEFAULT true, -- Show meeting organizer name
  show_attendees BOOLEAN DEFAULT false, -- Show meeting attendees
  show_private_details BOOLEAN DEFAULT false, -- Show details of private meetings
  business_hours_start TIME DEFAULT '08:00:00', -- Start of business hours
  business_hours_end TIME DEFAULT '18:00:00', -- End of business hours

  -- Sync Status
  last_sync_at TIMESTAMPTZ, -- Last successful sync with Microsoft Graph
  last_sync_error TEXT, -- Last error message if sync failed
  sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'error', 'disabled'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),

  -- Constraints
  UNIQUE(screen_id) -- One calendar connection per screen
);

-- Table: calendar_events_cache
-- Caches calendar events to reduce API calls and improve performance
CREATE TABLE IF NOT EXISTS calendar_events_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,

  -- Event Details from Microsoft Graph
  event_id VARCHAR(255) NOT NULL, -- Microsoft Graph event ID
  subject VARCHAR(500), -- Meeting subject/title
  organizer_name VARCHAR(255), -- Meeting organizer
  organizer_email VARCHAR(255),

  -- Time Information
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(50), -- 'confirmed', 'tentative', 'cancelled'
  is_private BOOLEAN DEFAULT false,

  -- Location
  location VARCHAR(500), -- Meeting location/room

  -- Attendees (JSON array)
  attendees JSONB, -- Array of attendee objects

  -- Additional Details
  body_preview TEXT, -- Preview of meeting description
  categories TEXT[], -- Meeting categories/tags

  -- Metadata
  cached_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(calendar_connection_id, event_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_calendar_connections_screen_id ON calendar_connections(screen_id);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_active ON calendar_connections(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_calendar_events_cache_connection_id ON calendar_events_cache(calendar_connection_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_cache_time_range ON calendar_events_cache(start_time, end_time);

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on calendar_connections
DROP TRIGGER IF EXISTS trigger_update_calendar_connection_timestamp ON calendar_connections;
CREATE TRIGGER trigger_update_calendar_connection_timestamp
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_connection_updated_at();

-- Function: Clean old cached events (older than 7 days)
CREATE OR REPLACE FUNCTION clean_old_calendar_events()
RETURNS void AS $$
BEGIN
  DELETE FROM calendar_events_cache
  WHERE end_time < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE calendar_connections IS 'Stores Microsoft Outlook calendar connections for screens';
COMMENT ON TABLE calendar_events_cache IS 'Caches calendar events to reduce Microsoft Graph API calls';
COMMENT ON COLUMN calendar_connections.access_token IS 'OAuth access token (should be encrypted at rest)';
COMMENT ON COLUMN calendar_connections.refresh_token IS 'OAuth refresh token for renewing access (should be encrypted at rest)';
COMMENT ON COLUMN calendar_events_cache.attendees IS 'JSON array of meeting attendees from Microsoft Graph';

-- Grant permissions (adjust based on your RLS policies)
-- These will be refined with RLS policies later
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see calendar connections for their organization's screens
CREATE POLICY calendar_connections_org_access ON calendar_connections
  FOR ALL
  USING (
    screen_id IN (
      SELECT s.id FROM screens s
      JOIN locations l ON s.location_id = l.id
      JOIN districts d ON l.district_id = d.id
      WHERE d.organization_id = (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policy: Users can only see cached events for their organization's calendars
CREATE POLICY calendar_events_cache_org_access ON calendar_events_cache
  FOR ALL
  USING (
    calendar_connection_id IN (
      SELECT cc.id FROM calendar_connections cc
      JOIN screens s ON cc.screen_id = s.id
      JOIN locations l ON s.location_id = l.id
      JOIN districts d ON l.district_id = d.id
      WHERE d.organization_id = (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );
