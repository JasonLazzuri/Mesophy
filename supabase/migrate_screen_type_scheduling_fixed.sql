-- Fixed Migration: Implement Screen-Type-Specific Scheduling
-- First check what screen types actually exist in the database

-- Step 1: Check current enum values
SELECT unnest(enum_range(NULL::screen_type)) as screen_type_values;

-- Step 2: Add target_screen_types column to schedules table
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS target_screen_types screen_type[] DEFAULT NULL;

-- Add comment to explain the new column
COMMENT ON COLUMN schedules.target_screen_types IS 'Array of screen types this schedule targets. If NULL, targets all screen types (legacy global behavior)';

-- Step 3: Check what screen types are actually being used
SELECT DISTINCT screen_type, COUNT(*) as count
FROM screens 
GROUP BY screen_type
ORDER BY count DESC;

-- Step 4: Migrate existing global schedules to target specific screen types
-- Use only the screen types that actually exist in your database

-- For schedules that mention "menu" in their name, target menu_board
UPDATE schedules 
SET target_screen_types = ARRAY['menu_board']::screen_type[]
WHERE screen_id IS NULL 
  AND (
    LOWER(name) LIKE '%menu%' OR 
    LOWER(name) LIKE '%board%' OR
    LOWER(name) LIKE '%food%' OR
    LOWER(name) LIKE '%restaurant%'
  );

-- For schedules that mention "employee" in their name, target employee_board  
UPDATE schedules 
SET target_screen_types = ARRAY['employee_board']::screen_type[]
WHERE screen_id IS NULL 
  AND (
    LOWER(name) LIKE '%employee%' OR 
    LOWER(name) LIKE '%staff%' OR
    LOWER(name) LIKE '%hr%' OR
    LOWER(name) LIKE '%break%'
  );

-- For schedules that mention "ad" in their name, target ad_device
UPDATE schedules 
SET target_screen_types = ARRAY['ad_device']::screen_type[]
WHERE screen_id IS NULL 
  AND (
    LOWER(name) LIKE '%ad%' OR 
    LOWER(name) LIKE '%advertisement%' OR
    LOWER(name) LIKE '%promo%'
  );

-- For any remaining global schedules, set them to target the most common screen types
-- We'll only use the enum values that actually exist
UPDATE schedules 
SET target_screen_types = ARRAY['menu_board', 'employee_board', 'ad_device']::screen_type[]
WHERE screen_id IS NULL 
  AND target_screen_types IS NULL;

-- Step 5: For specific screen schedules, set target_screen_types based on their assigned screen
UPDATE schedules 
SET target_screen_types = ARRAY[sc.screen_type]::screen_type[]
FROM screens sc
WHERE schedules.screen_id = sc.id 
  AND schedules.target_screen_types IS NULL;

-- Step 6: Create new conflict detection function that's screen-type aware
DROP FUNCTION IF EXISTS check_schedule_conflicts(UUID, UUID, DATE, DATE, TIME, TIME, INTEGER[], INTEGER);

CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER,
    p_target_screen_types screen_type[] DEFAULT NULL
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
DECLARE
    target_screen_type screen_type;
    final_target_types screen_type[];
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

-- Step 7: Create a helper function to get all available screen types (fixed)
CREATE OR REPLACE FUNCTION get_screen_types()
RETURNS screen_type[] AS $$
BEGIN
    -- Return only the screen types that actually exist in your enum
    RETURN ARRAY['menu_board', 'employee_board', 'ad_device']::screen_type[];
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_schedules_target_screen_types ON schedules USING GIN (target_screen_types);
CREATE INDEX IF NOT EXISTS idx_schedules_active_times ON schedules (is_active, start_date, end_date, start_time, end_time) WHERE is_active = true;

-- Step 9: Verification queries
SELECT 
    'Current enum values:' as info,
    unnest(enum_range(NULL::screen_type)) as screen_type;

SELECT 
    'Schedule screen type distribution after migration:' as info,
    target_screen_types,
    COUNT(*) as schedule_count
FROM schedules 
WHERE is_active = true
GROUP BY target_screen_types
ORDER BY schedule_count DESC;

SELECT 
    'Schedules without target types:' as info,
    COUNT(*) as count
FROM schedules 
WHERE is_active = true 
    AND target_screen_types IS NULL;