-- CLEAN START: Create admin user from scratch
-- This script completely resets and creates a fresh admin user

-- Step 1: Clean up any existing problematic data
DO $$
BEGIN
    -- Delete any existing user profiles that might be causing issues
    DELETE FROM user_profiles WHERE email LIKE '%admin%' OR email LIKE '%test%';
    
    -- Delete any test auth users (BE CAREFUL - this will delete users!)
    -- Uncomment the line below only if you want to delete existing auth users
    -- DELETE FROM auth.users WHERE email LIKE '%admin%' OR email LIKE '%test%';
    
    RAISE NOTICE '🧹 Cleaned up existing test data';
END $$;

-- Step 2: Ensure organization exists
INSERT INTO organizations (id, name, description) VALUES 
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Mesophy Restaurant Group',
    'Digital signage management for restaurant chain operations'
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create admin user function (improved version)
CREATE OR REPLACE FUNCTION create_fresh_admin_user(
    admin_email TEXT,
    admin_password TEXT,
    admin_name TEXT DEFAULT 'Admin User'
)
RETURNS TEXT AS $$
DECLARE
    user_id UUID;
    result_message TEXT;
BEGIN
    -- Generate a new user ID
    user_id := gen_random_uuid();
    
    -- Check if user already exists in auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
        RETURN '❌ User with email ' || admin_email || ' already exists in auth.users. Use a different email or delete the existing user first.';
    END IF;
    
    -- Check if user already exists in user_profiles
    IF EXISTS (SELECT 1 FROM user_profiles WHERE email = admin_email) THEN
        RETURN '❌ User profile with email ' || admin_email || ' already exists. Use a different email or delete the existing profile first.';
    END IF;
    
    -- Insert into auth.users (this is usually handled by Supabase auth, but we'll do it manually)
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role,
        aud,
        confirmation_token,
        email_change_token_new,
        recovery_token
    ) VALUES (
        user_id,
        '00000000-0000-0000-0000-000000000000',
        admin_email,
        crypt(admin_password, gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "' || admin_name || '"}',
        false,
        'authenticated',
        'authenticated',
        '',
        '',
        ''
    );
    
    -- Create user profile (manually, since the trigger might not work as expected)
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
        user_id,
        admin_email,
        admin_name,
        'super_admin',
        '00000000-0000-0000-0000-000000000001'::uuid,
        NULL,
        NULL,
        NOW(),
        NOW()
    );
    
    result_message := '✅ Fresh admin user created successfully!' ||
                     E'\n📧 Email: ' || admin_email ||
                     E'\n🔑 Password: ' || admin_password ||
                     E'\n👤 Role: Super Admin' ||
                     E'\n🏢 Organization: Mesophy Restaurant Group' ||
                     E'\n🆔 User ID: ' || user_id ||
                     E'\n\n🚀 You can now login at your website!';
    
    RETURN result_message;
    
EXCEPTION WHEN OTHERS THEN
    RETURN '❌ Error creating admin user: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Usage instructions
DO $$
BEGIN
    RAISE NOTICE '🚀 Clean start script ready!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 To create your admin user, run:';
    RAISE NOTICE 'SELECT create_fresh_admin_user(''your-email@example.com'', ''your-password'', ''Your Full Name'');';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Example:';
    RAISE NOTICE 'SELECT create_fresh_admin_user(''admin@mesophy.com'', ''admin123'', ''Jason Lazzuri'');';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Make sure to use a NEW email address that hasn''t been used before!';
END $$;