-- Setup script to promote a user to super admin
-- Replace 'your-email@example.com' with the actual email address

-- This script should be run AFTER a user has signed up through the website
-- Find the user's ID and update their profile to be a super admin

-- Step 1: Find the user (replace with actual email)
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Step 2: Update user profile to super admin (replace USER_ID with actual UUID)
-- UPDATE user_profiles 
-- SET 
--     role = 'super_admin',
--     organization_id = '00000000-0000-0000-0000-000000000001'::uuid,
--     full_name = 'Admin User'
-- WHERE id = 'USER_ID_FROM_STEP_1'::uuid;

-- Alternative: Function to promote user by email
CREATE OR REPLACE FUNCTION promote_user_to_admin(user_email TEXT, user_full_name TEXT DEFAULT 'Admin User')
RETURNS TEXT AS $$
DECLARE
    user_id UUID;
    result_message TEXT;
BEGIN
    -- Find user by email
    SELECT id INTO user_id 
    FROM auth.users 
    WHERE email = user_email;
    
    IF user_id IS NULL THEN
        RETURN 'Error: User with email ' || user_email || ' not found. Please sign up first.';
    END IF;
    
    -- Update user profile
    UPDATE user_profiles 
    SET 
        role = 'super_admin',
        organization_id = '00000000-0000-0000-0000-000000000001'::uuid,
        full_name = user_full_name,
        district_id = NULL,
        location_id = NULL
    WHERE id = user_id;
    
    result_message := '✅ Successfully promoted ' || user_email || ' to super admin for Mesophy Restaurant Group';
    
    RETURN result_message;
END;
$$ LANGUAGE plpgsql;

-- Usage example (uncomment and modify):
-- SELECT promote_user_to_admin('your-email@example.com', 'Your Full Name');