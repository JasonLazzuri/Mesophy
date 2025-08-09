-- Debug script to check schedules table structure and identify issues

-- Step 1: Check current table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    ordinal_position
FROM information_schema.columns 
WHERE table_name = 'schedules' 
ORDER BY ordinal_position;

-- Step 2: Check if organization_id column exists
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'organization_id'
) AS organization_id_exists;

-- Step 3: Check constraints on schedules table
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'schedules'::regclass;

-- Step 4: Check existing schedules and their organization_id values
SELECT 
    id,
    name,
    organization_id,
    screen_id,
    created_at
FROM schedules 
ORDER BY created_at DESC 
LIMIT 10;

-- Step 5: Check if there are any foreign key issues
SELECT 
    s.id,
    s.name,
    s.organization_id,
    o.id as org_exists
FROM schedules s
LEFT JOIN organizations o ON s.organization_id = o.id
WHERE s.organization_id IS NOT NULL
LIMIT 10;

-- Step 6: Check sample organization IDs that should exist
SELECT id, name FROM organizations LIMIT 5;