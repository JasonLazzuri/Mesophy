-- SIMPLE APPROACH: Just create the user profile directly
-- This bypasses auth.users entirely and relies on Supabase's built-in auth

-- First, make sure the organization exists
INSERT INTO organizations (id, name, description) VALUES 
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Mesophy Restaurant Group',
    'Digital signage management for restaurant chain operations'
)
ON CONFLICT (id) DO NOTHING;

-- Simple function to create user profile when you sign up normally
CREATE OR REPLACE FUNCTION setup_admin_profile(
    user_email TEXT,
    user_name TEXT DEFAULT 'Admin User'
)
RETURNS TEXT AS $$
DECLARE
    auth_user_id UUID;
    result_message TEXT;
BEGIN
    -- Find the user ID from auth.users
    SELECT id INTO auth_user_id 
    FROM auth.users 
    WHERE email = user_email;
    
    IF auth_user_id IS NULL THEN
        RETURN '❌ No user found with email: ' || user_email || '. Please sign up through the website first, then run this script.';
    END IF;
    
    -- Delete existing profile if it exists (to start fresh)
    DELETE FROM user_profiles WHERE id = auth_user_id;
    
    -- Create new admin profile
    INSERT INTO user_profiles (
        id,
        email,
        full_name,
        role,
        organization_id,
        district_id,
        location_id,
        created_at,
        updated_at
    ) VALUES (
        auth_user_id,
        user_email,
        user_name,
        'super_admin',
        '00000000-0000-0000-0000-000000000001'::uuid,
        NULL,
        NULL,
        NOW(),
        NOW()
    );
    
    result_message := '✅ Admin profile created successfully!' ||
                     E'\n📧 Email: ' || user_email ||
                     E'\n👤 Name: ' || user_name ||
                     E'\n🏢 Role: Super Admin' ||
                     E'\n🆔 User ID: ' || auth_user_id ||
                     E'\n\n🚀 You can now login with full admin access!';
    
    RETURN result_message;
    
EXCEPTION WHEN OTHERS THEN
    RETURN '❌ Error creating profile: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Instructions
DO $$
BEGIN
    RAISE NOTICE '🎯 SIMPLE APPROACH - Follow these steps:';
    RAISE NOTICE '';
    RAISE NOTICE '1️⃣ First, sign up through your website normally';
    RAISE NOTICE '2️⃣ Then run: SELECT setup_admin_profile(''your-email@example.com'', ''Your Name'');';
    RAISE NOTICE '';
    RAISE NOTICE '📧 This will promote your existing account to super admin';
END $$;