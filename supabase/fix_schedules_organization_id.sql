-- Fix schedules table: Add missing organization_id column and make screen_id optional
-- This migration brings the schedules table in line with the API expectations

-- Step 1: Add organization_id column to schedules table
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Step 2: Make screen_id optional (change from NOT NULL to nullable)
ALTER TABLE schedules 
ALTER COLUMN screen_id DROP NOT NULL;

-- Step 3: Create index for organization_id for better performance
CREATE INDEX IF NOT EXISTS idx_schedules_organization_id ON schedules(organization_id);

-- Step 4: Update existing schedules to have organization_id based on their screen's organization
-- This handles existing schedules that don't have organization_id set
UPDATE schedules 
SET organization_id = (
    SELECT DISTINCT districts.organization_id
    FROM screens 
    JOIN locations ON screens.location_id = locations.id
    JOIN districts ON locations.district_id = districts.id
    WHERE screens.id = schedules.screen_id
)
WHERE organization_id IS NULL AND screen_id IS NOT NULL;

-- Step 5: For any remaining schedules without organization_id (edge case), set to first org
-- This shouldn't be necessary in normal cases, but provides a fallback
UPDATE schedules 
SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

-- Step 6: Make organization_id NOT NULL after populating existing records
ALTER TABLE schedules 
ALTER COLUMN organization_id SET NOT NULL;

-- Step 7: Add support for target_screen_types column if it doesn't exist (for future enhancements)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'schedules' AND column_name = 'target_screen_types'
    ) THEN
        -- screen_type enum should already exist, if not this will create it
        -- CREATE TYPE screen_type AS ENUM ('menu_board', 'promo_board', 'employee_board', 'custom');
        
        -- Add target_screen_types column
        ALTER TABLE schedules 
        ADD COLUMN target_screen_types screen_type[];
        
        -- Add target_locations column for location-based targeting
        ALTER TABLE schedules 
        ADD COLUMN target_locations UUID[];
        
        -- Create indexes for these new columns
        CREATE INDEX IF NOT EXISTS idx_schedules_target_screen_types ON schedules USING GIN (target_screen_types);
        CREATE INDEX IF NOT EXISTS idx_schedules_target_locations ON schedules USING GIN (target_locations);
    END IF;
END $$;

-- Step 8: Update trigger for updated_at if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE event_object_table = 'schedules' 
        AND trigger_name = 'update_schedules_updated_at'
    ) THEN
        CREATE TRIGGER update_schedules_updated_at 
        BEFORE UPDATE ON schedules 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Verification: Check the updated table structure
-- You can run this query after the migration to verify:
/*
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'schedules' 
ORDER BY ordinal_position;
*/