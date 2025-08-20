-- Device Remote Control Commands Schema (Minimal Version)
-- Essential table for remote management and control of Pi devices

-- Device commands table for queuing and tracking remote commands
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT NOT NULL, -- Pi device identifier (pi-{serial} format)
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

-- Function to get pending commands for a device (ordered by priority)
CREATE OR REPLACE FUNCTION get_pending_commands(
    target_device_id TEXT,
    command_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    device_id TEXT,
    screen_id UUID,
    command_type TEXT,
    command_data JSONB,
    priority INTEGER,
    timeout_seconds INTEGER,
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    created_by UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.device_id,
        dc.screen_id,
        dc.command_type,
        dc.command_data,
        dc.priority,
        dc.timeout_seconds,
        dc.scheduled_for,
        dc.created_at,
        dc.created_by
    FROM device_commands dc
    WHERE dc.device_id = target_device_id
    AND dc.status = 'pending'
    AND dc.scheduled_for <= NOW()
    ORDER BY dc.priority ASC, dc.created_at ASC
    LIMIT command_limit;
END;
$$;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_device_commands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER trigger_update_device_commands_updated_at
    BEFORE UPDATE ON device_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_device_commands_updated_at();