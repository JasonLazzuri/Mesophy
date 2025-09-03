-- Device Remote Control Commands Schema
-- Enables remote management and control of Pi devices from the portal

-- Device commands table for queuing and tracking remote commands
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT NOT NULL, -- Device identifier (atv-{id}, pi-{id}, or dev-{id} format)
    screen_id UUID REFERENCES screens(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK (command_type IN (
        'restart',           -- Restart Pi client service
        'restart_content',   -- Restart digital signage software only
        'reboot',           -- Reboot the Pi device
        'shutdown',         -- Shutdown the Pi device
        'update_playlist',  -- Deploy new playlist
        'sync_content',     -- Force content sync
        'update_config',    -- Update Pi client configuration
        'clear_cache',      -- Clear media cache
        'emergency_message', -- Display emergency message
        'test_display',     -- Test display functionality
        'get_logs',         -- Retrieve system logs
        'health_check'      -- Perform system health check
    )),
    command_data JSONB DEFAULT '{}', -- Command parameters and payload
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',          -- Command queued, waiting for execution
        'executing',        -- Command currently being executed
        'completed',        -- Command executed successfully
        'failed',           -- Command execution failed
        'cancelled',        -- Command was cancelled
        'timeout'           -- Command timed out
    )),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest, 10 = lowest
    timeout_seconds INTEGER DEFAULT 300, -- Command timeout in seconds
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(), -- When command should be executed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id), -- User who created the command
    error_message TEXT,
    result JSONB DEFAULT '{}' -- Command execution results
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_commands_device_id ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created_at ON device_commands(created_at);
CREATE INDEX IF NOT EXISTS idx_device_commands_scheduled_for ON device_commands(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_device_commands_priority ON device_commands(priority);

-- Composite index for Pi polling queries (most important)
CREATE INDEX IF NOT EXISTS idx_device_commands_poll ON device_commands(device_id, status, scheduled_for, priority);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_commands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_device_commands_updated_at
    BEFORE UPDATE ON device_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_device_commands_updated_at();

-- Function to clean up old completed commands (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_device_commands()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM device_commands 
    WHERE status IN ('completed', 'failed', 'cancelled') 
    AND completed_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel pending commands for a device (useful for emergency stop)
CREATE OR REPLACE FUNCTION cancel_pending_device_commands(target_device_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    cancelled_count INTEGER;
BEGIN
    UPDATE device_commands 
    SET status = 'cancelled', 
        completed_at = NOW(),
        error_message = 'Cancelled by system'
    WHERE device_id = target_device_id 
    AND status = 'pending';
    
    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending commands for a device (used by Pi polling)
CREATE OR REPLACE FUNCTION get_pending_commands(target_device_id TEXT, command_limit INTEGER DEFAULT 5)
RETURNS TABLE (
    id UUID,
    command_type TEXT,
    command_data JSONB,
    priority INTEGER,
    timeout_seconds INTEGER,
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.command_type,
        dc.command_data,
        dc.priority,
        dc.timeout_seconds,
        dc.scheduled_for,
        dc.created_at
    FROM device_commands dc
    WHERE dc.device_id = target_device_id
    AND dc.status = 'pending'
    AND dc.scheduled_for <= NOW()
    ORDER BY dc.priority ASC, dc.created_at ASC
    LIMIT command_limit;
END;
$$ LANGUAGE plpgsql;

-- Update device_sync_log to track command execution (extend existing activity types)
DO $$
BEGIN
    -- Check if the activity column constraint allows our new values
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%device_sync_log%activity%'
        AND check_clause LIKE '%command_%'
    ) THEN
        -- Drop existing constraint if it exists and add new one
        ALTER TABLE device_sync_log DROP CONSTRAINT IF EXISTS device_sync_log_activity_check;
        ALTER TABLE device_sync_log ADD CONSTRAINT device_sync_log_activity_check 
        CHECK (activity IN (
            'heartbeat', 'content_sync', 'playlist_update', 'config_change',
            'restart_requested', 'force_sync_requested', 'device_unpaired',
            'command_queued', 'command_executed', 'command_failed'
        ));
    END IF;
END $$;

-- RLS Policies for device_commands
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage commands for devices in their organization
CREATE POLICY "Users can manage device commands for their organization" ON device_commands
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM screens s
        JOIN locations l ON s.location_id = l.id
        JOIN districts d ON l.district_id = d.id
        JOIN user_profiles up ON up.organization_id = d.organization_id
        WHERE s.device_id = device_commands.device_id 
        AND up.id = auth.uid()
    )
);

-- Policy: Allow device operations without authentication (for Pi client access)
-- This is needed for Pi devices to poll and update commands
-- We'll use device_id validation in the API layer for security
CREATE POLICY "Allow device operations for Pi clients" ON device_commands
FOR SELECT USING (true);

CREATE POLICY "Allow device command updates for Pi clients" ON device_commands
FOR UPDATE USING (true);

-- Add comments for documentation
COMMENT ON TABLE device_commands IS 'Queue and tracking for remote device commands';
COMMENT ON COLUMN device_commands.device_id IS 'Pi device identifier in pi-{serial} format';
COMMENT ON COLUMN device_commands.command_type IS 'Type of command to execute on device';
COMMENT ON COLUMN device_commands.command_data IS 'JSON payload with command parameters';
COMMENT ON COLUMN device_commands.status IS 'Current execution status of the command';
COMMENT ON COLUMN device_commands.priority IS 'Command priority (1=highest, 10=lowest)';
COMMENT ON COLUMN device_commands.timeout_seconds IS 'Maximum execution time before timeout';
COMMENT ON COLUMN device_commands.scheduled_for IS 'When command should be executed (allows scheduling)';
COMMENT ON COLUMN device_commands.result IS 'JSON result data from command execution';

-- Create a view for command status monitoring
CREATE OR REPLACE VIEW device_command_status AS
SELECT 
    dc.id,
    dc.device_id,
    s.name as screen_name,
    l.name as location_name,
    dc.command_type,
    dc.status,
    dc.priority,
    dc.created_at,
    dc.scheduled_for,
    dc.started_at,
    dc.completed_at,
    dc.error_message,
    CASE 
        WHEN dc.status = 'executing' AND dc.started_at < NOW() - (dc.timeout_seconds || ' seconds')::INTERVAL
        THEN true 
        ELSE false 
    END as is_timeout,
    EXTRACT(EPOCH FROM (COALESCE(dc.completed_at, NOW()) - dc.created_at)) as duration_seconds
FROM device_commands dc
LEFT JOIN screens s ON s.device_id = dc.device_id
LEFT JOIN locations l ON l.id = s.location_id
ORDER BY dc.created_at DESC;

COMMENT ON VIEW device_command_status IS 'Comprehensive view of device command status with screen and location information';