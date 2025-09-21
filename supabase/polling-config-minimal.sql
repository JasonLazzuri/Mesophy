-- Minimal Polling Configuration Schema
-- Run this in parts if the full file fails to load

-- Step 1: Create the main table
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

-- Step 2: Add basic indexes
CREATE INDEX IF NOT EXISTS idx_polling_configurations_org_id 
ON polling_configurations (organization_id);

-- Step 3: Grant permissions
GRANT SELECT, INSERT, UPDATE ON polling_configurations TO authenticated;