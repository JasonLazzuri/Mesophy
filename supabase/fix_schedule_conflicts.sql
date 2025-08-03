-- Fix schedule conflict detection to consider screen types
-- Different screen types should not conflict with each other

CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
BEGIN
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
            -- Case 1: Both schedules target specific screens
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND s.screen_id = p_screen_id)
            OR
            -- Case 2: One schedule is global (screen_id IS NULL), check screen type compatibility
            (s.screen_id IS NULL AND p_screen_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM screens sc1 
                WHERE sc1.id = p_screen_id 
                AND sc1.screen_type IN (
                    SELECT DISTINCT sc2.screen_type 
                    FROM screens sc2 
                    WHERE sc2.id = s.screen_id 
                    OR s.screen_id IS NULL -- Global schedule affects all screen types
                )
            ))
            OR
            -- Case 3: New schedule is global, check for conflicts with existing specific schedules
            (p_screen_id IS NULL AND s.screen_id IS NOT NULL)
            OR
            -- Case 4: Both schedules are global
            (s.screen_id IS NULL AND p_screen_id IS NULL)
        )
        AND (
            -- Date range overlap
            (s.end_date IS NULL OR s.end_date >= p_start_date) AND
            (p_end_date IS NULL OR s.start_date <= p_end_date)
        )
        AND (
            -- Time overlap
            (s.start_time < p_end_time AND s.end_time > p_start_time)
        )
        AND (
            -- Days of week overlap
            s.days_of_week && p_days_of_week
        );
END;
$$ LANGUAGE plpgsql;

-- Alternative simpler approach: Only check conflicts within the same screen type
-- This approach is more restrictive but clearer
CREATE OR REPLACE FUNCTION check_schedule_conflicts_by_screen_type(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
DECLARE
    target_screen_type screen_type;
BEGIN
    -- Get the screen type for the target screen (if specific screen is provided)
    IF p_screen_id IS NOT NULL THEN
        SELECT screen_type INTO target_screen_type 
        FROM screens 
        WHERE id = p_screen_id;
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
    LEFT JOIN screens sc ON s.screen_id = sc.id
    WHERE s.id != COALESCE(schedule_uuid, '00000000-0000-0000-0000-000000000000'::UUID)
        AND s.is_active = true
        AND (
            -- Case 1: Both schedules target the same specific screen
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND s.screen_id = p_screen_id)
            OR
            -- Case 2: One or both schedules are global (screen_id IS NULL) - these can conflict
            (s.screen_id IS NULL OR p_screen_id IS NULL)
            OR
            -- Case 3: Both target specific screens of the same type - potential conflict
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND 
             sc.screen_type = target_screen_type)
        )
        AND (
            -- Date range overlap
            (s.end_date IS NULL OR s.end_date >= p_start_date) AND
            (p_end_date IS NULL OR s.start_date <= p_end_date)
        )
        AND (
            -- Time overlap
            (s.start_time < p_end_time AND s.end_time > p_start_time)
        )
        AND (
            -- Days of week overlap
            s.days_of_week && p_days_of_week
        );
END;
$$ LANGUAGE plpgsql;

-- Use the simpler, clearer approach by default
DROP FUNCTION IF EXISTS check_schedule_conflicts(UUID, UUID, DATE, DATE, TIME, TIME, INTEGER[], INTEGER);
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
DECLARE
    target_screen_type screen_type;
BEGIN
    -- Get the screen type for the target screen (if specific screen is provided)
    IF p_screen_id IS NOT NULL THEN
        SELECT screen_type INTO target_screen_type 
        FROM screens 
        WHERE id = p_screen_id;
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
    LEFT JOIN screens sc ON s.screen_id = sc.id
    WHERE s.id != COALESCE(schedule_uuid, '00000000-0000-0000-0000-000000000000'::UUID)
        AND s.is_active = true
        AND (
            -- Case 1: Both schedules target the same specific screen
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND s.screen_id = p_screen_id)
            OR
            -- Case 2: One or both schedules are global (screen_id IS NULL) - these can conflict
            (s.screen_id IS NULL OR p_screen_id IS NULL)
            OR
            -- Case 3: Both target specific screens of the same type - potential conflict
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND 
             sc.screen_type = target_screen_type)
        )
        AND (
            -- Date range overlap
            (s.end_date IS NULL OR s.end_date >= p_start_date) AND
            (p_end_date IS NULL OR s.start_date <= p_end_date)
        )
        AND (
            -- Time overlap
            (s.start_time < p_end_time AND s.end_time > p_start_time)
        )
        AND (
            -- Days of week overlap
            s.days_of_week && p_days_of_week
        );
END;
$$ LANGUAGE plpgsql;