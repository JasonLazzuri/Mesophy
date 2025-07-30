-- Fix existing user profile - convert to super admin
-- This script checks and updates an existing user profile instead of creating a new one

-- Step 1: Check current user profile status
SELECT 
    id,
    email,
    role,
    organization_id,
    full_name,
    created_at
FROM user_profiles 
WHERE id = 'd1112278-8c95-4f6c-8ccf-ee151ffe8121'::uuid;

-- Step 2: Update existing profile to super admin
UPDATE user_profiles 
SET 
    role = 'super_admin',
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid,
    full_name = COALESCE(full_name, 'Admin User'),
    district_id = NULL,
    location_id = NULL,
    updated_at = NOW()
WHERE id = 'd1112278-8c95-4f6c-8ccf-ee151ffe8121'::uuid;

-- Step 3: Verify the update worked
SELECT 
    id,
    email,
    role,
    organization_id,
    full_name,
    'Successfully updated to super_admin!' as status
FROM user_profiles 
WHERE id = 'd1112278-8c95-4f6c-8ccf-ee151ffe8121'::uuid;

-- Step 4: Check that the organization exists
SELECT 
    id,
    name,
    description
FROM organizations 
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;