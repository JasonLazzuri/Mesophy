-- Device Health Metrics Table
-- Run this in Supabase SQL editor to add health monitoring

CREATE TABLE IF NOT EXISTS device_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    screen_id UUID,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Device Information
    device_model TEXT,
    device_manufacturer TEXT,
    android_version TEXT,
    api_level INTEGER,
    app_version TEXT,
    
    -- Memory Metrics
    total_ram BIGINT,
    available_ram BIGINT,
    used_ram BIGINT,
    free_ram_percentage REAL,
    low_memory BOOLEAN,
    
    -- Storage Metrics
    total_storage BIGINT,
    available_storage BIGINT,
    used_storage BIGINT,
    free_storage_percentage REAL,
    
    -- Network Metrics
    is_connected BOOLEAN,
    connection_type TEXT,
    signal_strength INTEGER,
    
    -- CPU Metrics
    cpu_usage_percentage REAL,
    core_count INTEGER,
    
    -- App Metrics
    uptime_millis BIGINT,
    last_restart_time TIMESTAMPTZ,
    app_memory_usage BIGINT,
    thread_count INTEGER,
    
    -- Health Status
    health_level TEXT CHECK (health_level IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
    issues TEXT[],
    warnings TEXT[],
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Foreign key constraints (will be added if devices table exists)
    CONSTRAINT fk_device_health_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_health_device_id ON device_health_metrics(device_id);
CREATE INDEX IF NOT EXISTS idx_device_health_timestamp ON device_health_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_device_health_screen_id ON device_health_metrics(screen_id);
CREATE INDEX IF NOT EXISTS idx_device_health_level ON device_health_metrics(health_level);

-- Index for recent metrics (last 24 hours)
CREATE INDEX IF NOT EXISTS idx_device_health_recent 
ON device_health_metrics(device_id, timestamp) 
WHERE timestamp > NOW() - INTERVAL '24 hours';

-- Comments
COMMENT ON TABLE device_health_metrics IS 'Health monitoring metrics from Android TV devices';
COMMENT ON COLUMN device_health_metrics.device_id IS 'References the device sending the metrics';
COMMENT ON COLUMN device_health_metrics.health_level IS 'Overall health status: HEALTHY, WARNING, CRITICAL, UNKNOWN';
COMMENT ON COLUMN device_health_metrics.free_ram_percentage IS 'Percentage of RAM that is free (0.0 to 1.0)';
COMMENT ON COLUMN device_health_metrics.free_storage_percentage IS 'Percentage of storage that is free (0.0 to 1.0)';

-- Row Level Security (RLS) policies
ALTER TABLE device_health_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see health metrics for devices they have access to
CREATE POLICY "Users can view health metrics for accessible devices" ON device_health_metrics
FOR SELECT USING (
    device_id IN (
        SELECT d.id FROM devices d
        WHERE auth.uid() IN (
            SELECT user_id FROM user_profiles up
            WHERE up.organization_id = d.organization_id
            OR (up.role = 'district_manager' AND d.location_id IN (
                SELECT l.id FROM locations l
                WHERE l.district_id = up.district_id
            ))
            OR (up.role = 'location_manager' AND d.location_id = up.location_id)
            OR up.role = 'super_admin'
        )
    )
);

-- Policy: Only devices can insert their own health metrics
CREATE POLICY "Devices can insert their own health metrics" ON device_health_metrics
FOR INSERT WITH CHECK (
    device_id IN (
        SELECT d.id FROM devices d
        WHERE d.device_token = current_setting('request.jwt.claims', true)::json->>'device_token'
    )
);

-- Function to get latest health status for a device
CREATE OR REPLACE FUNCTION get_device_health_status(device_uuid UUID)
RETURNS TABLE (
    health_level TEXT,
    last_seen TIMESTAMPTZ,
    free_ram_percentage REAL,
    free_storage_percentage REAL,
    cpu_usage_percentage REAL,
    is_online BOOLEAN,
    issues TEXT[],
    warnings TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dhm.health_level,
        dhm.timestamp as last_seen,
        dhm.free_ram_percentage,
        dhm.free_storage_percentage,
        dhm.cpu_usage_percentage,
        (dhm.timestamp > NOW() - INTERVAL '5 minutes') as is_online,
        dhm.issues,
        dhm.warnings
    FROM device_health_metrics dhm
    WHERE dhm.device_id = device_uuid
    ORDER BY dhm.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get health history for a device
CREATE OR REPLACE FUNCTION get_device_health_history(
    device_uuid UUID,
    hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
    timestamp TIMESTAMPTZ,
    health_level TEXT,
    free_ram_percentage REAL,
    free_storage_percentage REAL,
    cpu_usage_percentage REAL,
    is_connected BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dhm.timestamp,
        dhm.health_level,
        dhm.free_ram_percentage,
        dhm.free_storage_percentage,
        dhm.cpu_usage_percentage,
        dhm.is_connected
    FROM device_health_metrics dhm
    WHERE dhm.device_id = device_uuid
    AND dhm.timestamp > NOW() - (hours_back || ' hours')::INTERVAL
    ORDER BY dhm.timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old health metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_health_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM device_health_metrics 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON device_health_metrics TO authenticated;
GRANT INSERT ON device_health_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_health_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_health_history(UUID, INTEGER) TO authenticated;

-- Optional: Create a scheduled job to clean up old metrics (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-health-metrics', '0 2 * * *', 'SELECT cleanup_old_health_metrics();');

-- Sample queries for testing:
/*
-- Get latest health status for a device
SELECT * FROM get_device_health_status('your-device-uuid-here');

-- Get health history for last 24 hours
SELECT * FROM get_device_health_history('your-device-uuid-here', 24);

-- Get all critical health alerts from last hour
SELECT device_id, timestamp, issues, warnings
FROM device_health_metrics 
WHERE health_level = 'CRITICAL' 
AND timestamp > NOW() - INTERVAL '1 hour';

-- Get devices with low memory (< 15%)
SELECT device_id, free_ram_percentage, timestamp
FROM device_health_metrics 
WHERE free_ram_percentage < 0.15
AND timestamp > NOW() - INTERVAL '1 hour';
*/