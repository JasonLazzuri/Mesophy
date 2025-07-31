-- Migration: Add is_active column to locations table
-- This column is required by the API and frontend but was missing from the schema

-- Add the is_active column to locations table
ALTER TABLE locations 
ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Update existing records to be active by default
UPDATE locations SET is_active = true WHERE is_active IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN locations.is_active IS 'Whether the location is active and should display content on screens';

-- Verify the migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'locations' 
        AND column_name = 'is_active'
    ) THEN
        RAISE NOTICE '✅ Successfully added is_active column to locations table';
    ELSE
        RAISE EXCEPTION '❌ Failed to add is_active column to locations table';
    END IF;
END $$;