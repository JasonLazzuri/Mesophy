-- Power Scheduling Schema for Digital Signage Platform
-- Enables bulk power management by device type with PST timezone default

-- Add power scheduling columns to screens table
ALTER TABLE screens 
ADD COLUMN IF NOT EXISTS power_schedule_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS power_on_time TIME DEFAULT '06:00:00',
ADD COLUMN IF NOT EXISTS power_off_time TIME DEFAULT '23:00:00',
ADD COLUMN IF NOT EXISTS power_timezone TEXT DEFAULT 'America/Los_Angeles', -- PST/PDT
ADD COLUMN IF NOT EXISTS power_energy_saving BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS power_warning_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS power_last_updated TIMESTAMP DEFAULT NOW();

-- Create power schedule profiles table for bulk management by device type
CREATE TABLE IF NOT EXISTS power_schedule_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('menu_board', 'drive_thru', 'lobby_display', 'kitchen_display', 'promotional')),
    
    -- Power schedule settings
    power_on_time TIME NOT NULL DEFAULT '06:00:00',
    power_off_time TIME NOT NULL DEFAULT '23:00:00',
    power_timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    power_energy_saving BOOLEAN DEFAULT true,
    power_warning_minutes INTEGER DEFAULT 5 CHECK (power_warning_minutes >= 0 AND power_warning_minutes <= 30),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    
    UNIQUE(organization_id, profile_name)
);

-- Add RLS policies for power_schedule_profiles
ALTER TABLE power_schedule_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view power schedule profiles for their organization" ON power_schedule_profiles
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM user_profiles 
            WHERE (role = 'super_admin' OR organization_id = power_schedule_profiles.organization_id)
        )
    );

CREATE POLICY "Users can manage power schedule profiles for their organization" ON power_schedule_profiles
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM user_profiles 
            WHERE role IN ('super_admin', 'district_manager') 
            AND (role = 'super_admin' OR organization_id = power_schedule_profiles.organization_id)
        )
    );

-- Create default power schedule profiles for each device type
DO $$
DECLARE
    org_record RECORD;
    admin_user_id UUID;
BEGIN
    -- Get the first super admin user for created_by field
    SELECT user_id INTO admin_user_id 
    FROM user_profiles 
    WHERE role = 'super_admin' 
    LIMIT 1;

    -- Create default profiles for each organization
    FOR org_record IN SELECT id FROM organizations LOOP
        -- Menu Board (Standard restaurant hours)
        INSERT INTO power_schedule_profiles (
            organization_id, profile_name, device_type,
            power_on_time, power_off_time, power_timezone,
            power_energy_saving, power_warning_minutes,
            created_by, updated_by
        ) VALUES (
            org_record.id, 'Standard Menu Board Hours', 'menu_board',
            '06:00:00', '23:00:00', 'America/Los_Angeles',
            true, 5, admin_user_id, admin_user_id
        ) ON CONFLICT (organization_id, profile_name) DO NOTHING;

        -- Drive Thru (Extended hours)
        INSERT INTO power_schedule_profiles (
            organization_id, profile_name, device_type,
            power_on_time, power_off_time, power_timezone,
            power_energy_saving, power_warning_minutes,
            created_by, updated_by
        ) VALUES (
            org_record.id, 'Drive Thru Extended Hours', 'drive_thru',
            '05:30:00', '23:30:00', 'America/Los_Angeles',
            true, 10, admin_user_id, admin_user_id
        ) ON CONFLICT (organization_id, profile_name) DO NOTHING;

        -- Lobby Display (Business hours)
        INSERT INTO power_schedule_profiles (
            organization_id, profile_name, device_type,
            power_on_time, power_off_time, power_timezone,
            power_energy_saving, power_warning_minutes,
            created_by, updated_by
        ) VALUES (
            org_record.id, 'Lobby Business Hours', 'lobby_display',
            '07:00:00', '22:00:00', 'America/Los_Angeles',
            true, 5, admin_user_id, admin_user_id
        ) ON CONFLICT (organization_id, profile_name) DO NOTHING;

        -- Kitchen Display (Always on during service)
        INSERT INTO power_schedule_profiles (
            organization_id, profile_name, device_type,
            power_on_time, power_off_time, power_timezone,
            power_energy_saving, power_warning_minutes,
            created_by, updated_by
        ) VALUES (
            org_record.id, 'Kitchen Service Hours', 'kitchen_display',
            '05:00:00', '23:59:00', 'America/Los_Angeles',
            false, 15, admin_user_id, admin_user_id
        ) ON CONFLICT (organization_id, profile_name) DO NOTHING;

        -- Promotional Display (Peak hours)
        INSERT INTO power_schedule_profiles (
            organization_id, profile_name, device_type,
            power_on_time, power_off_time, power_timezone,
            power_energy_saving, power_warning_minutes,
            created_by, updated_by
        ) VALUES (
            org_record.id, 'Promotional Peak Hours', 'promotional',
            '11:00:00', '21:00:00', 'America/Los_Angeles',
            true, 3, admin_user_id, admin_user_id
        ) ON CONFLICT (organization_id, profile_name) DO NOTHING;
    END LOOP;
END $$;

-- Function to apply power schedule profile to multiple screens
CREATE OR REPLACE FUNCTION apply_power_schedule_profile(
    profile_id UUID,
    target_device_type TEXT DEFAULT NULL,
    target_location_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    updated_count INTEGER,
    screen_ids UUID[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    profile_record RECORD;
    updated_screens UUID[];
    update_count INTEGER;
BEGIN
    -- Get profile details
    SELECT * INTO profile_record
    FROM power_schedule_profiles
    WHERE id = profile_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Power schedule profile not found';
    END IF;
    
    -- Update screens based on criteria
    WITH updated AS (
        UPDATE screens 
        SET 
            power_schedule_enabled = true,
            power_on_time = profile_record.power_on_time,
            power_off_time = profile_record.power_off_time,
            power_timezone = profile_record.power_timezone,
            power_energy_saving = profile_record.power_energy_saving,
            power_warning_minutes = profile_record.power_warning_minutes,
            power_last_updated = NOW()
        WHERE 
            -- Filter by device type if specified
            (target_device_type IS NULL OR screen_type = target_device_type)
            -- Filter by location IDs if specified
            AND (target_location_ids IS NULL OR location_id = ANY(target_location_ids))
            -- Only update screens the user has access to
            AND location_id IN (
                SELECT l.id FROM locations l
                JOIN districts d ON l.district_id = d.id
                WHERE d.organization_id = profile_record.organization_id
            )
        RETURNING id
    )
    SELECT array_agg(id), count(*) 
    INTO updated_screens, update_count
    FROM updated;
    
    -- Log the bulk update
    INSERT INTO device_sync_log (screen_id, activity, details)
    SELECT 
        unnest(updated_screens),
        'power_schedule_updated',
        json_build_object(
            'profile_id', profile_id,
            'profile_name', profile_record.profile_name,
            'device_type', profile_record.device_type,
            'power_on_time', profile_record.power_on_time,
            'power_off_time', profile_record.power_off_time,
            'updated_by', auth.uid(),
            'bulk_update', true
        );
    
    RETURN QUERY SELECT update_count, updated_screens;
END;
$$;

-- Add power scheduling to device_commands table for remote updates
ALTER TABLE device_commands 
ADD COLUMN IF NOT EXISTS power_schedule_data JSONB;

-- Comment on new columns for documentation
COMMENT ON COLUMN screens.power_schedule_enabled IS 'Enable/disable automatic power scheduling';
COMMENT ON COLUMN screens.power_on_time IS 'Time to turn displays ON (local time)';
COMMENT ON COLUMN screens.power_off_time IS 'Time to turn displays OFF (local time)';
COMMENT ON COLUMN screens.power_timezone IS 'Timezone for power schedule (default: America/Los_Angeles for PST)';
COMMENT ON COLUMN screens.power_energy_saving IS 'Enable energy saving features during off hours';
COMMENT ON COLUMN screens.power_warning_minutes IS 'Minutes of warning before automatic shutdown (0-30)';

COMMENT ON TABLE power_schedule_profiles IS 'Reusable power schedule profiles for bulk management by device type';
COMMENT ON FUNCTION apply_power_schedule_profile IS 'Apply power schedule profile to multiple screens with filtering options';