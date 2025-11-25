-- Add days_of_week column to power_schedule_profiles table
-- This allows power schedules to be configured for specific days of the week

ALTER TABLE power_schedule_profiles
ADD COLUMN IF NOT EXISTS days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6];

-- Add comment to explain the column
COMMENT ON COLUMN power_schedule_profiles.days_of_week IS 'Days of week when schedule is active. 0=Sunday, 1=Monday, ..., 6=Saturday';
