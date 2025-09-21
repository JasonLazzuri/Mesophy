-- Polling Configuration Schema
-- Enables organization-wide adaptive polling schedules with timezone support

-- Create polling configurations table
CREATE TABLE IF NOT EXISTS polling_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    time_periods JSONB NOT NULL DEFAULT '[
        {
            "name": "prep_time",
            "start": "06:00", 
            "end": "10:00", 
            "interval_seconds": 15,
            "description": "Morning prep time - high frequency polling"
        },
        {
            "name": "setup_time",
            "start": "10:00", 
            "end": "12:00", 
            "interval_seconds": 37,
            "description": "Setup time - moderate frequency polling"
        },
        {
            "name": "service_time",
            "start": "12:00", 
            "end": "06:00", 
            "interval_seconds": 900,
            "description": "Service and overnight - low frequency polling"
        }
    ]',
    emergency_override BOOLEAN NOT NULL DEFAULT false,
    emergency_interval_seconds INTEGER NOT NULL DEFAULT 15,
    emergency_timeout_hours INTEGER NOT NULL DEFAULT 4,
    emergency_started_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_polling_configurations_org_id 
ON polling_configurations (organization_id);

CREATE INDEX IF NOT EXISTS idx_polling_configurations_emergency 
ON polling_configurations (emergency_override) WHERE emergency_override = true;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_polling_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER polling_configurations_updated_at
    BEFORE UPDATE ON polling_configurations
    FOR EACH ROW EXECUTE FUNCTION update_polling_configurations_updated_at();

-- Create function to get current polling interval for a device
CREATE OR REPLACE FUNCTION get_current_polling_interval(p_organization_id UUID)
RETURNS TABLE (
    interval_seconds INTEGER,
    is_emergency BOOLEAN,
    current_period_name TEXT,
    timezone TEXT
) AS $$
DECLARE
    config_row polling_configurations%ROWTYPE;
    current_time_in_tz TIME;
    period_obj JSONB;
    period_start TIME;
    period_end TIME;
    found_period BOOLEAN := false;
BEGIN
    -- Get the polling configuration for the organization
    SELECT * INTO config_row
    FROM polling_configurations
    WHERE organization_id = p_organization_id;
    
    -- If no configuration found, return default values
    IF NOT FOUND THEN
        RETURN QUERY SELECT 900, false, 'default'::TEXT, 'America/Los_Angeles'::TEXT;
        RETURN;
    END IF;
    
    -- Check if emergency override is active
    IF config_row.emergency_override THEN
        -- Check if emergency has timed out
        IF config_row.emergency_started_at IS NOT NULL AND 
           config_row.emergency_started_at + (config_row.emergency_timeout_hours || ' hours')::INTERVAL < NOW() THEN
            -- Emergency has timed out, turn it off
            UPDATE polling_configurations 
            SET emergency_override = false, emergency_started_at = NULL 
            WHERE id = config_row.id;
        ELSE
            -- Emergency is active
            RETURN QUERY SELECT config_row.emergency_interval_seconds, true, 'emergency'::TEXT, config_row.timezone;
            RETURN;
        END IF;
    END IF;
    
    -- Get current time in the configured timezone
    SELECT (NOW() AT TIME ZONE config_row.timezone)::TIME INTO current_time_in_tz;
    
    -- Find the appropriate time period
    FOR period_obj IN SELECT jsonb_array_elements(config_row.time_periods)
    LOOP
        period_start := (period_obj->>'start')::TIME;
        period_end := (period_obj->>'end')::TIME;
        
        -- Handle periods that span midnight (e.g., 12:00 PM to 6:00 AM)
        IF period_start <= period_end THEN
            -- Normal period (doesn't cross midnight)
            IF current_time_in_tz >= period_start AND current_time_in_tz < period_end THEN
                found_period := true;
            END IF;
        ELSE
            -- Period crosses midnight
            IF current_time_in_tz >= period_start OR current_time_in_tz < period_end THEN
                found_period := true;
            END IF;
        END IF;
        
        IF found_period THEN
            RETURN QUERY SELECT 
                (period_obj->>'interval_seconds')::INTEGER,
                false,
                (period_obj->>'name')::TEXT,
                config_row.timezone;
            RETURN;
        END IF;
    END LOOP;
    
    -- If no period found (shouldn't happen), return default
    RETURN QUERY SELECT 900, false, 'fallback'::TEXT, config_row.timezone;
END;
$$ LANGUAGE plpgsql;

-- Create function to activate emergency override
CREATE OR REPLACE FUNCTION activate_emergency_override(p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE polling_configurations 
    SET 
        emergency_override = true,
        emergency_started_at = NOW(),
        updated_at = NOW()
    WHERE organization_id = p_organization_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create function to deactivate emergency override
CREATE OR REPLACE FUNCTION deactivate_emergency_override(p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE polling_configurations 
    SET 
        emergency_override = false,
        emergency_started_at = NULL,
        updated_at = NOW()
    WHERE organization_id = p_organization_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for API access
GRANT SELECT, INSERT, UPDATE ON polling_configurations TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_polling_interval TO authenticated;
GRANT EXECUTE ON FUNCTION activate_emergency_override TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_emergency_override TO authenticated;

-- Create default polling configuration for existing organizations
INSERT INTO polling_configurations (organization_id, timezone, time_periods)
SELECT 
    id,
    'America/Los_Angeles',
    '[
        {
            "name": "prep_time",
            "start": "06:00", 
            "end": "10:00", 
            "interval_seconds": 15,
            "description": "Morning prep time - high frequency polling"
        },
        {
            "name": "setup_time",
            "start": "10:00", 
            "end": "12:00", 
            "interval_seconds": 37,
            "description": "Setup time - moderate frequency polling"
        },
        {
            "name": "service_time",
            "start": "12:00", 
            "end": "06:00", 
            "interval_seconds": 900,
            "description": "Service and overnight - low frequency polling"
        }
    ]'::JSONB
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM polling_configurations);

-- Show setup verification
SELECT 
    '=== POLLING CONFIGURATION SETUP ===' as section,
    COUNT(*) as organizations_with_config,
    COUNT(*) FILTER (WHERE emergency_override = true) as emergency_active_count
FROM polling_configurations;

-- Test the get_current_polling_interval function
SELECT 
    '=== FUNCTION TEST ===' as section,
    interval_seconds,
    is_emergency,
    current_period_name,
    timezone
FROM get_current_polling_interval(
    (SELECT id FROM organizations LIMIT 1)
);