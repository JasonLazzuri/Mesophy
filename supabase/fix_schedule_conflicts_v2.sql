-- CORRECTED Fix for schedule conflict detection
-- The issue: Different screen types (menu_board vs employee_board) should NOT conflict
-- Only schedules targeting the SAME screen type should be checked for conflicts

-- First, let's completely replace the function with clearer logic
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
    -- If we're checking for a specific screen, get its type
    IF p_screen_id IS NOT NULL THEN
        SELECT screen_type INTO target_screen_type 
        FROM screens 
        WHERE id = p_screen_id;
        
        -- If screen not found, return no conflicts
        IF target_screen_type IS NULL THEN
            RETURN;
        END IF;
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
            -- CASE 1: Both schedules are global (no specific screen assigned)
            (s.screen_id IS NULL AND p_screen_id IS NULL)
            OR
            -- CASE 2: Exact same screen match
            (s.screen_id IS NOT NULL AND s.screen_id = p_screen_id)
            OR
            -- CASE 3: One is global, other targets specific screen of any type
            -- (Global schedules affect all screens, so they conflict with specific schedules)
            (s.screen_id IS NULL AND p_screen_id IS NOT NULL)
            OR
            (p_screen_id IS NULL AND s.screen_id IS NOT NULL)
            OR
            -- CASE 4: Both target specific screens of the SAME type (this is key!)
            -- This is where we fix the bug - only check conflicts within same screen type
            (s.screen_id IS NOT NULL AND p_screen_id IS NOT NULL AND 
             s.screen_id != p_screen_id AND 
             sc.screen_type = target_screen_type)
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

-- Test the function to verify it works correctly
-- This should help debug what's happening
SELECT 
    'Testing conflict function...' as test_step,
    NULL::UUID as conflicting_schedule_id,
    NULL::VARCHAR as conflicting_schedule_name,
    NULL::TEXT as conflict_type
WHERE FALSE  -- This just creates the structure for testing