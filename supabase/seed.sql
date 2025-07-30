-- Seed data for initial setup
-- Run this after the schema and RLS policies are in place

-- Insert initial organization (restaurant chain)
INSERT INTO organizations (id, name, description) VALUES 
(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Mesophy Restaurant Group',
    'Digital signage management for restaurant chain operations'
);

-- Insert sample districts
INSERT INTO districts (id, organization_id, name, description) VALUES 
(
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'North District',
    'Northern region restaurants'
),
(
    '10000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'South District', 
    'Southern region restaurants'
),
(
    '10000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'East District',
    'Eastern region restaurants'
);

-- Insert sample locations for North District
INSERT INTO locations (id, district_id, name, address, phone, timezone) VALUES 
(
    '20000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Downtown Main Street',
    '123 Main Street, Downtown City, ST 12345',
    '(555) 123-4567',
    'America/New_York'
),
(
    '20000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Northside Plaza',
    '456 Plaza Drive, Northside, ST 12346',
    '(555) 234-5678',
    'America/New_York'
),
(
    '20000000-0000-0000-0000-000000000003'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Uptown Center',
    '789 Center Ave, Uptown, ST 12347',
    '(555) 345-6789',
    'America/New_York'
);

-- Insert sample locations for South District
INSERT INTO locations (id, district_id, name, address, phone, timezone) VALUES 
(
    '20000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    'Southgate Mall',
    '321 Mall Blvd, Southgate, ST 12348',
    '(555) 456-7890',
    'America/Chicago'
),
(
    '20000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    'Riverside Commons',
    '654 River Road, Riverside, ST 12349',
    '(555) 567-8901',
    'America/Chicago'
);

-- Insert sample screens for Downtown Main Street location
INSERT INTO screens (id, location_id, name, screen_type, device_id, resolution, orientation, device_status) VALUES 
(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'Front Counter Menu Board',
    'menu_board',
    'DEVICE_001_MENU',
    '1920x1080',
    'landscape',
    'offline'
),
(
    '30000000-0000-0000-0000-000000000002'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'Drive-Through Display',
    'menu_board',
    'DEVICE_001_DRIVE',
    '1920x1080',
    'landscape',
    'offline'
),
(
    '30000000-0000-0000-0000-000000000003'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'Waiting Area Ads',
    'ad_device',
    'DEVICE_001_ADS',
    '1080x1920',
    'portrait',
    'offline'
),
(
    '30000000-0000-0000-0000-000000000004'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'Staff Information Board',
    'employee_board',
    'DEVICE_001_STAFF',
    '1920x1080',
    'landscape',
    'offline'
);

-- Insert sample screens for Northside Plaza location
INSERT INTO screens (id, location_id, name, screen_type, device_id, resolution, orientation, device_status) VALUES 
(
    '30000000-0000-0000-0000-000000000005'::uuid,
    '20000000-0000-0000-0000-000000000002'::uuid,
    'Main Menu Display',
    'menu_board',
    'DEVICE_002_MENU',
    '1920x1080',
    'landscape',
    'offline'
),
(
    '30000000-0000-0000-0000-000000000006'::uuid,
    '20000000-0000-0000-0000-000000000002'::uuid,
    'Promotional Screen',
    'ad_device',
    'DEVICE_002_PROMO',
    '1920x1080',
    'landscape',
    'offline'
),
(
    '30000000-0000-0000-0000-000000000007'::uuid,
    '20000000-0000-0000-0000-000000000002'::uuid,
    'Employee Dashboard',
    'employee_board',
    'DEVICE_002_EMP',
    '1920x1080',
    'landscape',
    'offline'
);

-- Create a default playlist
INSERT INTO playlists (id, organization_id, name, description, is_default) VALUES 
(
    '40000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Default Welcome Content',
    'Default content shown when no specific content is scheduled',
    true
);

-- Note: User profiles will be created automatically when users sign up
-- The trigger function handles this based on the auth.users table

-- Display setup completion message
DO $$
BEGIN
    RAISE NOTICE '✅ Seed data inserted successfully!';
    RAISE NOTICE '📊 Created:';
    RAISE NOTICE '   • 1 Organization: Mesophy Restaurant Group';
    RAISE NOTICE '   • 3 Districts: North, South, East';
    RAISE NOTICE '   • 5 Restaurant Locations';
    RAISE NOTICE '   • 7 Digital Screens (menu boards, ads, employee boards)';
    RAISE NOTICE '   • 1 Default Playlist';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Next Steps:';
    RAISE NOTICE '   1. Create your first user account on the website';
    RAISE NOTICE '   2. Update the user profile to be a super_admin';
    RAISE NOTICE '   3. Start managing your digital signage network!';
END $$;