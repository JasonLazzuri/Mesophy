-- Debug script to test the schedule conflict detection

-- First, let's see what schedules exist
SELECT 
    s.id,
    s.name,
    s.screen_id,
    sc.screen_type,
    sc.name as screen_name,
    s.priority,
    s.start_time,
    s.end_time,
    s.days_of_week
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id
WHERE s.is_active = true
ORDER BY s.created_at DESC;

-- Let's test the conflict function with a sample case
-- Example: Check for conflicts when creating a schedule for a menu_board screen
-- with priority 1 at 9:00-17:00 on weekdays

SELECT * FROM check_schedule_conflicts(
    NULL::UUID,                                        -- schedule_uuid (new schedule)
    '30000000-0000-0000-0000-000000000002'::UUID,     -- p_screen_id (sample menu board)
    '2025-01-01'::DATE,                               -- p_start_date
    NULL::DATE,                                        -- p_end_date
    '09:00'::TIME,                                     -- p_start_time
    '17:00'::TIME,                                     -- p_end_time
    ARRAY[1,2,3,4,5],                                 -- p_days_of_week (weekdays)
    1                                                  -- p_priority
);

-- Also check what screen types we have
SELECT DISTINCT screen_type FROM screens;