-- Fix foreign key references for power_schedule_profiles
-- Change created_by and updated_by to reference user_profiles instead of auth.users

-- Drop existing foreign key constraints
ALTER TABLE power_schedule_profiles
DROP CONSTRAINT IF EXISTS power_schedule_profiles_created_by_fkey;

ALTER TABLE power_schedule_profiles
DROP CONSTRAINT IF EXISTS power_schedule_profiles_updated_by_fkey;

-- Add new foreign key constraints referencing user_profiles
ALTER TABLE power_schedule_profiles
ADD CONSTRAINT power_schedule_profiles_created_by_fkey
FOREIGN KEY (created_by) REFERENCES user_profiles(id);

ALTER TABLE power_schedule_profiles
ADD CONSTRAINT power_schedule_profiles_updated_by_fkey
FOREIGN KEY (updated_by) REFERENCES user_profiles(id);
