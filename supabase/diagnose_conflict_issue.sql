-- Diagnostic script to understand the conflict detection issue

-- 1. First, let's see the current schedules and their screen types
SELECT 
    s.id,
    s.name as schedule_name,
    s.screen_id,
    sc.name as screen_name,
    sc.screen_type,
    s.priority,
    s.start_time,
    s.end_time,
    s.days_of_week,
    s.is_active
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id
WHERE s.is_active = true
ORDER BY s.created_at DESC;

-- 2. Let's specifically look at the two conflicting schedules mentioned in the error
-- Schedule ID from error: 5211d296-20f5-4855-b040-dd31c244f1b6 (Menu Board)
-- Screen ID from error: d732c7ac-076d-471c-b656-f40f8d1857e5 (Employee boards)

SELECT 
    'Menu Board Schedule Details' as info,
    s.id,
    s.name,
    s.screen_id,
    sc.name as screen_name,
    sc.screen_type,
    s.priority
FROM schedules s
LEFT JOIN screens sc ON s.screen_id = sc.id
WHERE s.id = '5211d296-20f5-4855-b040-dd31c244f1b6';

SELECT 
    'Employee Board Screen Details' as info,
    id,
    name,
    screen_type
FROM screens 
WHERE id = 'd732c7ac-076d-471c-b656-f40f8d1857e5';

-- 3. Test the conflict function directly with the specific parameters
-- This will show us exactly what the function is returning
SELECT 
    'Testing conflict function directly' as test_info,
    *
FROM check_schedule_conflicts(
    NULL::UUID,                                           -- schedule_uuid (new schedule)
    'd732c7ac-076d-471c-b656-f40f8d1857e5'::UUID,       -- Employee board screen ID
    CURRENT_DATE,                                         -- start_date
    NULL::DATE,                                           -- end_date  
    '09:00'::TIME,                                        -- start_time
    '17:00'::TIME,                                        -- end_time
    ARRAY[1,2,3,4,5],                                    -- weekdays
    1                                                     -- priority
);

-- 4. Let's see what screen types we have
SELECT DISTINCT screen_type FROM screens;

-- 5. Check if our function was actually updated by looking at its definition
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'check_schedule_conflicts'
    AND routine_type = 'FUNCTION';