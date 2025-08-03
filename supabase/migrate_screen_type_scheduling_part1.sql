-- Part 1: Add new enum value for promo_board
-- This must be run first and committed before Part 2

-- Step 1: Add the new enum value
ALTER TYPE screen_type ADD VALUE IF NOT EXISTS 'promo_board';

-- This completes Part 1 - you must run this first and let it commit
-- Then run migrate_screen_type_scheduling_part2.sql