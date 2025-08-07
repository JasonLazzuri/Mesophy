-- Pi Device Integration Schema
-- Add device pairing and management capabilities

-- Device pairing codes table (temporary codes for device setup)
CREATE TABLE IF NOT EXISTS device_pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    device_info JSONB DEFAULT '{}',
    device_ip TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    screen_id UUID REFERENCES screens(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_code ON device_pairing_codes(code);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_expires_at ON device_pairing_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_used_at ON device_pairing_codes(used_at);

-- Device heartbeat and sync tracking
ALTER TABLE screens 
ADD COLUMN IF NOT EXISTS device_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS device_ip TEXT;

-- Add indexes for device management
CREATE INDEX IF NOT EXISTS idx_screens_device_token ON screens(device_token);
CREATE INDEX IF NOT EXISTS idx_screens_last_sync_at ON screens(last_sync_at);

-- Device sync log (track what was synced when)
CREATE TABLE IF NOT EXISTS device_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'schedule', 'media', 'heartbeat')),
    sync_data JSONB DEFAULT '{}',
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for sync log queries
CREATE INDEX IF NOT EXISTS idx_device_sync_log_screen_id ON device_sync_log(screen_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_created_at ON device_sync_log(created_at);

-- Function to generate unique pairing codes
CREATE OR REPLACE FUNCTION generate_pairing_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_count INTEGER;
BEGIN
    LOOP
        -- Generate 6-character alphanumeric code (excluding similar looking chars)
        code := upper(substring(replace(encode(gen_random_bytes(6), 'base64'), '+/', '23'), 1, 6));
        code := translate(code, '0O1IL', '23456');
        
        -- Check if code already exists and is not expired
        SELECT COUNT(*) INTO exists_count
        FROM device_pairing_codes 
        WHERE code = code AND expires_at > NOW();
        
        -- If unique, exit loop
        EXIT WHEN exists_count = 0;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired pairing codes
CREATE OR REPLACE FUNCTION cleanup_expired_pairing_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM device_pairing_codes 
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure device token
CREATE OR REPLACE FUNCTION generate_device_token()
RETURNS TEXT AS $$
BEGIN
    RETURN 'pi_' || replace(encode(gen_random_bytes(32), 'base64'), '/', '_');
END;
$$ LANGUAGE plpgsql;

-- RLS Policies for device pairing codes (only accessible by authenticated users)
ALTER TABLE device_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage pairing codes for their organization" ON device_pairing_codes
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM screens s
        JOIN locations l ON s.location_id = l.id
        JOIN districts d ON l.district_id = d.id
        JOIN user_profiles up ON up.organization_id = d.organization_id
        WHERE s.id = screen_id AND up.id = auth.uid()
    )
);

-- RLS Policies for device sync log
ALTER TABLE device_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sync logs for their organization screens" ON device_sync_log
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM screens s
        JOIN locations l ON s.location_id = l.id
        JOIN districts d ON l.district_id = d.id
        JOIN user_profiles up ON up.organization_id = d.organization_id
        WHERE s.id = screen_id AND up.id = auth.uid()
    )
);

-- Comments for documentation
COMMENT ON TABLE device_pairing_codes IS 'Temporary codes for pairing Pi devices to screens';
COMMENT ON TABLE device_sync_log IS 'Log of device synchronization activities';
COMMENT ON COLUMN screens.device_token IS 'Secure token for Pi device authentication';
COMMENT ON COLUMN screens.device_info IS 'Hardware and system information from Pi device';
COMMENT ON COLUMN screens.last_sync_at IS 'Last time device synced with platform';
COMMENT ON COLUMN screens.sync_version IS 'Version counter for change detection';
COMMENT ON COLUMN screens.device_ip IS 'Last known IP address of device';