-- Fix type casting in apply_power_schedule_profile function
-- This fixes the "operator does not exist: screen_type = text" error

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
            -- Filter by device type if specified (cast screen_type ENUM to text)
            (target_device_type IS NULL OR screen_type::text = target_device_type)
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
