-- Add restart_content command type to device_commands table
-- This allows for software-only restarts vs full device reboots

-- Drop the existing constraint
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_command_type_check;

-- Add the new constraint with restart_content included
ALTER TABLE device_commands ADD CONSTRAINT device_commands_command_type_check 
CHECK (command_type IN (
    'restart',           -- Restart Pi client service (legacy - will be renamed)
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
));

-- Add comment explaining the restart types
COMMENT ON COLUMN device_commands.command_type IS 
'Command type to execute on device. restart_content = software only, reboot = full device restart';