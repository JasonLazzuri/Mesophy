-- Migration: Add Location-Specific Targeting to Schedules
-- This allows schedules to target specific locations in addition to screen types

-- Add target_locations column to schedules table
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS target_locations UUID[] DEFAULT NULL;

-- Add comment to explain the new column
COMMENT ON COLUMN schedules.target_locations IS 'Array of location IDs this schedule targets. If NULL, targets all locations within the organization (respecting target_screen_types)';

-- Create index for better performance on location targeting queries
CREATE INDEX IF NOT EXISTS idx_schedules_target_locations ON schedules USING GIN (target_locations);

-- Update the check_schedule_conflicts function to handle location targeting
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER,
    p_target_screen_types screen_type[] DEFAULT NULL,
    p_target_locations UUID[] DEFAULT NULL
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
DECLARE
    target_screen_type screen_type;
    final_target_types screen_type[];
    final_target_locations UUID[];
    screen_location_id UUID;
BEGIN
    -- Determine what screen types we're targeting
    IF p_target_screen_types IS NOT NULL AND array_length(p_target_screen_types, 1) > 0 THEN
        -- Use provided screen types
        final_target_types := p_target_screen_types;
    ELSIF p_screen_id IS NOT NULL THEN
        -- Get screen type from specific screen and use that
        SELECT screen_type INTO target_screen_type 
        FROM screens 
        WHERE id = p_screen_id;
        
        IF target_screen_type IS NOT NULL THEN
            final_target_types := ARRAY[target_screen_type];
        ELSE
            -- Screen not found, return no conflicts
            RETURN;
        END IF;
    ELSE
        -- No screen types specified and no specific screen - return no conflicts
        RETURN;
    END IF;

    -- Determine what locations we're targeting
    IF p_target_locations IS NOT NULL AND array_length(p_target_locations, 1) > 0 THEN
        -- Use provided locations
        final_target_locations := p_target_locations;
    ELSIF p_screen_id IS NOT NULL THEN
        -- Get location from specific screen
        SELECT location_id INTO screen_location_id 
        FROM screens 
        WHERE id = p_screen_id;
        
        IF screen_location_id IS NOT NULL THEN
            final_target_locations := ARRAY[screen_location_id];
        ELSE
            -- Screen not found, return no conflicts
            RETURN;
        END IF;
    ELSE
        -- No specific locations and no specific screen - will check all locations
        final_target_locations := NULL;
    END IF;

    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        CASE 
            WHEN s.priority = p_priority THEN 'same_priority'
            WHEN s.priority > p_priority THEN 'higher_priority'
            ELSE 'lower_priority'
        END as conflict_type
    FROM schedules s
    WHERE s.id != COALESCE(schedule_uuid, '00000000-0000-0000-0000-000000000000'::UUID)
        AND s.is_active = true
        AND (
            -- Check if there's overlap in target screen types
            (s.target_screen_types && final_target_types) OR
            -- Handle legacy schedules without target_screen_types set
            (s.target_screen_types IS NULL AND s.screen_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM screens sc 
                WHERE sc.id = s.screen_id 
                AND sc.screen_type = ANY(final_target_types)
            )) OR
            -- Handle legacy global schedules (should target everything)
            (s.target_screen_types IS NULL AND s.screen_id IS NULL)
        )
        AND (
            -- Check if there's overlap in target locations
            (
                -- If both schedules target specific locations, check for overlap
                (s.target_locations IS NOT NULL AND final_target_locations IS NOT NULL AND s.target_locations && final_target_locations) OR
                -- If this schedule targets specific locations but existing doesn't, check if existing applies to our locations
                (s.target_locations IS NULL AND final_target_locations IS NOT NULL AND (
                    s.screen_id IS NULL OR EXISTS (
                        SELECT 1 FROM screens sc 
                        WHERE sc.id = s.screen_id 
                        AND sc.location_id = ANY(final_target_locations)
                    )
                )) OR
                -- If existing schedule targets specific locations but this doesn't, check if this applies to existing locations
                (s.target_locations IS NOT NULL AND final_target_locations IS NULL) OR
                -- If neither targets specific locations, they both apply globally
                (s.target_locations IS NULL AND final_target_locations IS NULL)
            )
        )
        AND (
            -- Date range overlap check
            (s.end_date IS NULL OR s.end_date >= p_start_date) AND
            (p_end_date IS NULL OR s.start_date <= p_end_date)
        )
        AND (
            -- Time overlap check
            (s.start_time < p_end_time AND s.end_time > p_start_time)
        )
        AND (
            -- Days of week overlap check
            s.days_of_week && p_days_of_week
        );
END;
$$ LANGUAGE plpgsql;

-- Create a helper function to get locations for a user based on their role
CREATE OR REPLACE FUNCTION get_user_accessible_locations(user_id UUID)
RETURNS TABLE(
    location_id UUID,
    location_name TEXT,
    district_id UUID,
    district_name TEXT
) AS $$
DECLARE
    user_profile RECORD;
BEGIN
    -- Get user profile
    SELECT * INTO user_profile
    FROM user_profiles 
    WHERE id = user_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Return locations based on user role
    IF user_profile.role = 'super_admin' THEN
        -- Super admin can access all locations in their organization
        RETURN QUERY
        SELECT l.id, l.name, d.id, d.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        WHERE d.organization_id = user_profile.organization_id
        ORDER BY d.name, l.name;
        
    ELSIF user_profile.role = 'district_manager' AND user_profile.district_id IS NOT NULL THEN
        -- District manager can access locations in their district
        RETURN QUERY
        SELECT l.id, l.name, d.id, d.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        WHERE d.id = user_profile.district_id
        ORDER BY l.name;
        
    ELSIF user_profile.role = 'location_manager' AND user_profile.location_id IS NOT NULL THEN
        -- Location manager can only access their location
        RETURN QUERY
        SELECT l.id, l.name, d.id, d.name
        FROM locations l
        JOIN districts d ON l.district_id = d.id
        WHERE l.id = user_profile.location_id;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Verification queries
SELECT 'Schedules table updated with target_locations column' as status;

SELECT 
    'Current schedules with location targeting:' as info,
    target_locations,
    COUNT(*) as schedule_count
FROM schedules 
WHERE is_active = true
GROUP BY target_locations
ORDER BY schedule_count DESC;