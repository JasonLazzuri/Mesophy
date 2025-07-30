-- Quick admin setup - creates an admin user directly in the database
-- Use this if you want to bypass email confirmation for testing

-- First, disable email confirmation temporarily (run in Supabase Dashboard > Settings > Auth)
-- Set "Enable email confirmations" to OFF

-- Or create admin user directly (replace with your details):
-- This creates a user without going through the signup process

CREATE OR REPLACE FUNCTION create_admin_user(
    admin_email TEXT,
    admin_password TEXT,
    admin_name TEXT DEFAULT 'Admin User'
)
RETURNS TEXT AS $$
DECLARE
    user_id UUID;
    encrypted_password TEXT;
    result_message TEXT;
BEGIN
    -- Generate a user ID
    user_id := gen_random_uuid();
    
    -- Hash the password (simple example - in production use proper hashing)
    encrypted_password := crypt(admin_password, gen_salt('bf'));
    
    -- Insert into auth.users
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
        role
    ) VALUES (
        user_id,
        '00000000-0000-0000-0000-000000000000',
        admin_email,
        encrypted_password,
        NOW(),
        NOW(),
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "' || admin_name || '"}',
        false,
        'authenticated'
    );
    
    -- The trigger will automatically create the user profile
    -- Then update it to super admin
    UPDATE user_profiles 
    SET 
        role = 'super_admin',
        organization_id = '00000000-0000-0000-0000-000000000001'::uuid,
        full_name = admin_name,
        district_id = NULL,
        location_id = NULL
    WHERE id = user_id;
    
    result_message := '✅ Admin user created successfully!' ||
                     E'\n📧 Email: ' || admin_email ||
                     E'\n🔑 Password: ' || admin_password ||
                     E'\n👤 Role: Super Admin' ||
                     E'\n🏢 Organization: Mesophy Restaurant Group' ||
                     E'\n\n🚀 You can now login at your website!';
    
    RETURN result_message;
    
EXCEPTION WHEN OTHERS THEN
    RETURN '❌ Error creating admin user: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Usage example (uncomment and modify):
-- SELECT create_admin_user('admin@mesophy.com', 'admin123', 'Jason Lazzuri');