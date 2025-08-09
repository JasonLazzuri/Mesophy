-- Improved migration to fix schedules table organization_id issue
-- This version handles edge cases and provides better error handling

BEGIN;

-- Step 1: Check if organization_id already exists
DO $$
BEGIN
    -- Add organization_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'schedules' AND column_name = 'organization_id'
    ) THEN
        RAISE NOTICE 'Adding organization_id column to schedules table';
        ALTER TABLE schedules ADD COLUMN organization_id UUID;
        
        -- Add the foreign key constraint
        ALTER TABLE schedules 
        ADD CONSTRAINT fk_schedules_organization_id 
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
        
        -- Create index for better performance
        CREATE INDEX idx_schedules_organization_id ON schedules(organization_id);
    ELSE
        RAISE NOTICE 'organization_id column already exists in schedules table';
    END IF;
END $$;

-- Step 2: Make screen_id nullable if it's currently NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'schedules' 
        AND column_name = 'screen_id' 
        AND is_nullable = 'NO'
    ) THEN
        RAISE NOTICE 'Making screen_id nullable in schedules table';
        ALTER TABLE schedules ALTER COLUMN screen_id DROP NOT NULL;
    ELSE
        RAISE NOTICE 'screen_id is already nullable or does not exist';
    END IF;
END $$;

-- Step 3: Update existing schedules to have organization_id
-- Method 1: Via screen relationship
UPDATE schedules 
SET organization_id = (
    SELECT districts.organization_id
    FROM screens 
    JOIN locations ON screens.location_id = locations.id
    JOIN districts ON locations.district_id = districts.id
    WHERE screens.id = schedules.screen_id
)
WHERE organization_id IS NULL 
AND screen_id IS NOT NULL
AND EXISTS (
    SELECT 1 
    FROM screens 
    JOIN locations ON screens.location_id = locations.id
    JOIN districts ON locations.district_id = districts.id
    WHERE screens.id = schedules.screen_id
);

-- Step 4: For orphaned schedules, try to find organization via created_by user
UPDATE schedules 
SET organization_id = (
    SELECT up.organization_id
    FROM user_profiles up
    WHERE up.id = schedules.created_by
    LIMIT 1
)
WHERE organization_id IS NULL 
AND created_by IS NOT NULL
AND EXISTS (
    SELECT 1 FROM user_profiles up 
    WHERE up.id = schedules.created_by 
    AND up.organization_id IS NOT NULL
);

-- Step 5: Final fallback - assign to first available organization
-- Only for remaining NULL records
UPDATE schedules 
SET organization_id = (
    SELECT id FROM organizations 
    ORDER BY created_at ASC 
    LIMIT 1
)
WHERE organization_id IS NULL
AND EXISTS (SELECT 1 FROM organizations);

-- Step 6: Make organization_id NOT NULL after all updates
DO $$
BEGIN
    -- Check if there are still NULL values
    IF EXISTS (SELECT 1 FROM schedules WHERE organization_id IS NULL) THEN
        RAISE WARNING 'Some schedules still have NULL organization_id. Please investigate:';
        -- Show the problematic records
        RAISE WARNING 'Schedules with NULL organization_id: %', 
            (SELECT COUNT(*) FROM schedules WHERE organization_id IS NULL);
    ELSE
        RAISE NOTICE 'All schedules now have organization_id values';
        -- Make the column NOT NULL
        ALTER TABLE schedules ALTER COLUMN organization_id SET NOT NULL;
    END IF;
END $$;

-- Step 7: Add updated_at trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE event_object_table = 'schedules' 
        AND trigger_name = 'update_schedules_updated_at'
    ) THEN
        RAISE NOTICE 'Adding updated_at trigger to schedules table';
        CREATE TRIGGER update_schedules_updated_at 
        BEFORE UPDATE ON schedules 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ELSE
        RAISE NOTICE 'updated_at trigger already exists on schedules table';
    END IF;
END $$;

-- Verification query
SELECT 
    'Migration completed' as status,
    COUNT(*) as total_schedules,
    COUNT(organization_id) as schedules_with_org_id,
    COUNT(*) - COUNT(organization_id) as schedules_missing_org_id
FROM schedules;

COMMIT;