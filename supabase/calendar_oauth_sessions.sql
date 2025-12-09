-- Calendar OAuth Sessions Table
-- Stores temporary OAuth tokens during calendar connection flow for media assets
-- Sessions expire after 30 minutes

CREATE TABLE IF NOT EXISTS calendar_oauth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  microsoft_user_id TEXT NOT NULL,
  microsoft_email TEXT NOT NULL,
  microsoft_display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- Session expiration (30 minutes from creation)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_oauth_sessions_user_id ON calendar_oauth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_oauth_sessions_expires_at ON calendar_oauth_sessions(expires_at);

-- Enable RLS
ALTER TABLE calendar_oauth_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only access their own OAuth sessions
CREATE POLICY "Users can view their own OAuth sessions"
  ON calendar_oauth_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OAuth sessions"
  ON calendar_oauth_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OAuth sessions"
  ON calendar_oauth_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OAuth sessions"
  ON calendar_oauth_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Automatic cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM calendar_oauth_sessions
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup to run periodically (every hour)
-- Note: You may need to set up a cron job or scheduled task to call this function
-- For Supabase, you can use pg_cron extension or call this from your application

COMMENT ON TABLE calendar_oauth_sessions IS 'Temporary storage for OAuth tokens during calendar media asset creation. Sessions expire after 30 minutes.';
COMMENT ON COLUMN calendar_oauth_sessions.session_id IS 'Unique session identifier (format: media_{timestamp}_{random})';
COMMENT ON COLUMN calendar_oauth_sessions.expires_at IS 'Session expiration time (30 minutes from creation)';
COMMENT ON COLUMN calendar_oauth_sessions.token_expires_at IS 'Microsoft access token expiration time';
