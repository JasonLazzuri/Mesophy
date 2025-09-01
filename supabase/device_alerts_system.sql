-- Device Alerts System
-- Creates tables and functions for automated device alerting

-- Device alerts table to store all alert events
CREATE TABLE IF NOT EXISTS device_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) NOT NULL,
    screen_id UUID REFERENCES screens(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('device_offline', 'performance_warning', 'command_failure')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    metric_value NUMERIC,
    threshold NUMERIC,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email queue table for asynchronous email sending
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    alert_type VARCHAR(50),
    device_name VARCHAR(255),
    location_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Device health thresholds table for configurable alerting
CREATE TABLE IF NOT EXISTS device_health_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    threshold_type VARCHAR(50) NOT NULL,
    warning_value NUMERIC NOT NULL,
    critical_value NUMERIC NOT NULL,
    unit VARCHAR(20),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, threshold_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_alerts_device_id ON device_alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_device_alerts_screen_id ON device_alerts(screen_id);
CREATE INDEX IF NOT EXISTS idx_device_alerts_type_severity ON device_alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_device_alerts_created_at ON device_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_resolved ON device_alerts(resolved) WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_health_thresholds_org ON device_health_thresholds(organization_id);

-- Function to automatically resolve old alerts
CREATE OR REPLACE FUNCTION resolve_old_alerts()
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER;
BEGIN
    UPDATE device_alerts 
    SET resolved = TRUE, resolved_at = NOW(), updated_at = NOW()
    WHERE resolved = FALSE 
    AND alert_type = 'device_offline'
    AND created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get device alert summary
CREATE OR REPLACE FUNCTION get_device_alert_summary(target_device_id VARCHAR(255) DEFAULT NULL)
RETURNS TABLE (
    device_id VARCHAR(255),
    device_name VARCHAR(255),
    location_name VARCHAR(255),
    total_alerts BIGINT,
    critical_alerts BIGINT,
    unresolved_alerts BIGINT,
    last_alert_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        da.device_id,
        s.name as device_name,
        l.name as location_name,
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE da.severity = 'critical') as critical_alerts,
        COUNT(*) FILTER (WHERE da.resolved = FALSE) as unresolved_alerts,
        MAX(da.created_at) as last_alert_time
    FROM device_alerts da
    JOIN screens s ON da.screen_id = s.id
    JOIN locations l ON s.location_id = l.id
    WHERE (target_device_id IS NULL OR da.device_id = target_device_id)
    AND da.created_at > NOW() - INTERVAL '7 days'
    GROUP BY da.device_id, s.name, l.name
    ORDER BY unresolved_alerts DESC, last_alert_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Insert default health thresholds for all organizations
INSERT INTO device_health_thresholds (organization_id, threshold_type, warning_value, critical_value, unit, enabled)
SELECT 
    o.id,
    'memory_usage_percent',
    80.0,
    90.0,
    'percent',
    TRUE
FROM organizations o
ON CONFLICT (organization_id, threshold_type) DO NOTHING;

INSERT INTO device_health_thresholds (organization_id, threshold_type, warning_value, critical_value, unit, enabled)
SELECT 
    o.id,
    'storage_usage_percent', 
    85.0,
    95.0,
    'percent',
    TRUE
FROM organizations o
ON CONFLICT (organization_id, threshold_type) DO NOTHING;

INSERT INTO device_health_thresholds (organization_id, threshold_type, warning_value, critical_value, unit, enabled)
SELECT 
    o.id,
    'offline_duration_minutes',
    30.0,
    60.0,
    'minutes',
    TRUE
FROM organizations o
ON CONFLICT (organization_id, threshold_type) DO NOTHING;

-- RLS Policies for device_alerts
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alerts for their accessible devices" ON device_alerts
    FOR SELECT USING (
        screen_id IN (
            SELECT s.id FROM screens s
            JOIN locations l ON s.location_id = l.id
            JOIN districts d ON l.district_id = d.id
            JOIN user_profiles up ON up.id = auth.uid()
            WHERE 
                up.role = 'super_admin' OR
                (up.role = 'district_manager' AND up.district_id = d.id) OR
                (up.role = 'location_manager' AND up.location_id = l.id)
        )
    );

CREATE POLICY "Users can create alerts for their accessible devices" ON device_alerts
    FOR INSERT WITH CHECK (
        screen_id IN (
            SELECT s.id FROM screens s
            JOIN locations l ON s.location_id = l.id
            JOIN districts d ON l.district_id = d.id
            JOIN user_profiles up ON up.id = auth.uid()
            WHERE 
                up.role = 'super_admin' OR
                (up.role = 'district_manager' AND up.district_id = d.id) OR
                (up.role = 'location_manager' AND up.location_id = l.id)
        )
    );

-- RLS Policies for email_queue (admin only)
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only super admins can manage email queue" ON email_queue
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = auth.uid() AND up.role = 'super_admin'
        )
    );

-- RLS Policies for device_health_thresholds
ALTER TABLE device_health_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view thresholds for their organization" ON device_health_thresholds
    FOR SELECT USING (
        organization_id IN (
            SELECT up.organization_id FROM user_profiles up 
            WHERE up.id = auth.uid()
        )
    );

CREATE POLICY "Super admins can manage all thresholds" ON device_health_thresholds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = auth.uid() AND up.role = 'super_admin'
        )
    );

-- Update function for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_device_alerts_updated_at
    BEFORE UPDATE ON device_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_health_thresholds_updated_at
    BEFORE UPDATE ON device_health_thresholds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE device_alerts IS 'Stores all device alert events with severity levels and resolution tracking';
COMMENT ON TABLE email_queue IS 'Queue for asynchronous email sending with retry logic';
COMMENT ON TABLE device_health_thresholds IS 'Configurable health thresholds per organization';
COMMENT ON FUNCTION get_device_alert_summary IS 'Returns alert summary statistics for devices';
COMMENT ON FUNCTION resolve_old_alerts IS 'Automatically resolves old offline alerts';