-- Enable Row Level Security on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organization_id
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organization_id 
        FROM user_profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN (
        SELECT role 
        FROM user_profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user can access district
CREATE OR REPLACE FUNCTION can_access_district(district_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
    user_district_id UUID;
    user_user_role user_role;
BEGIN
    SELECT organization_id, district_id, role 
    INTO user_org_id, user_district_id, user_user_role
    FROM user_profiles 
    WHERE id = auth.uid();
    
    -- Super admin can access any district in their org
    IF user_user_role = 'super_admin' THEN
        RETURN EXISTS (
            SELECT 1 FROM districts 
            WHERE id = district_uuid AND organization_id = user_org_id
        );
    END IF;
    
    -- District manager can access their own district
    IF user_user_role = 'district_manager' THEN
        RETURN district_uuid = user_district_id;
    END IF;
    
    -- Location manager can access their district
    IF user_user_role = 'location_manager' THEN
        RETURN EXISTS (
            SELECT 1 FROM locations l
            JOIN user_profiles up ON up.location_id = l.id
            WHERE l.district_id = district_uuid AND up.id = auth.uid()
        );
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user can access location
CREATE OR REPLACE FUNCTION can_access_location(location_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
    user_district_id UUID;
    user_location_id UUID;
    user_user_role user_role;
BEGIN
    SELECT organization_id, district_id, location_id, role 
    INTO user_org_id, user_district_id, user_location_id, user_user_role
    FROM user_profiles 
    WHERE id = auth.uid();
    
    -- Super admin can access any location in their org
    IF user_user_role = 'super_admin' THEN
        RETURN EXISTS (
            SELECT 1 FROM locations l
            JOIN districts d ON l.district_id = d.id
            WHERE l.id = location_uuid AND d.organization_id = user_org_id
        );
    END IF;
    
    -- District manager can access locations in their district
    IF user_user_role = 'district_manager' THEN
        RETURN EXISTS (
            SELECT 1 FROM locations 
            WHERE id = location_uuid AND district_id = user_district_id
        );
    END IF;
    
    -- Location manager can access their own location
    IF user_user_role = 'location_manager' THEN
        RETURN location_uuid = user_location_id;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Organizations RLS Policies
CREATE POLICY "Users can view their organization" ON organizations
    FOR SELECT USING (id = get_user_organization_id());

CREATE POLICY "Super admins can update their organization" ON organizations
    FOR UPDATE USING (
        id = get_user_organization_id() AND 
        get_user_role() = 'super_admin'
    );

-- Districts RLS Policies
CREATE POLICY "Users can view districts in their organization" ON districts
    FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Super admins can manage districts" ON districts
    FOR ALL USING (
        organization_id = get_user_organization_id() AND 
        get_user_role() = 'super_admin'
    );

CREATE POLICY "District managers can view their district" ON districts
    FOR SELECT USING (can_access_district(id));

-- Locations RLS Policies
CREATE POLICY "Users can view accessible locations" ON locations
    FOR SELECT USING (can_access_location(id));

CREATE POLICY "Super admins and district managers can manage locations" ON locations
    FOR ALL USING (
        can_access_location(id) AND 
        get_user_role() IN ('super_admin', 'district_manager')
    );

-- User Profiles RLS Policies
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Super admins can view users in their organization" ON user_profiles
    FOR SELECT USING (
        organization_id = get_user_organization_id() AND 
        get_user_role() = 'super_admin'
    );

CREATE POLICY "Super admins can manage users in their organization" ON user_profiles
    FOR ALL USING (
        organization_id = get_user_organization_id() AND 
        get_user_role() = 'super_admin'
    );

CREATE POLICY "District managers can view users in their district" ON user_profiles
    FOR SELECT USING (
        get_user_role() = 'district_manager' AND
        (district_id = (SELECT district_id FROM user_profiles WHERE id = auth.uid()) OR
         location_id IN (
             SELECT id FROM locations 
             WHERE district_id = (SELECT district_id FROM user_profiles WHERE id = auth.uid())
         ))
    );

-- Screens RLS Policies
CREATE POLICY "Users can view screens in accessible locations" ON screens
    FOR SELECT USING (can_access_location(location_id));

CREATE POLICY "Super admins and district managers can manage screens" ON screens
    FOR ALL USING (
        can_access_location(location_id) AND 
        get_user_role() IN ('super_admin', 'district_manager')
    );

CREATE POLICY "Location managers can view screens in their location" ON screens
    FOR SELECT USING (
        get_user_role() = 'location_manager' AND
        location_id = (SELECT location_id FROM user_profiles WHERE id = auth.uid())
    );

-- Media Assets RLS Policies
CREATE POLICY "Users can view media in their organization" ON media_assets
    FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage media in their organization" ON media_assets
    FOR ALL USING (organization_id = get_user_organization_id());

-- Playlists RLS Policies
CREATE POLICY "Users can view playlists in their organization" ON playlists
    FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage playlists in their organization" ON playlists
    FOR ALL USING (organization_id = get_user_organization_id());

-- Playlist Items RLS Policies
CREATE POLICY "Users can view playlist items in their organization" ON playlist_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM playlists p 
            WHERE p.id = playlist_id AND p.organization_id = get_user_organization_id()
        )
    );

CREATE POLICY "Users can manage playlist items in their organization" ON playlist_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM playlists p 
            WHERE p.id = playlist_id AND p.organization_id = get_user_organization_id()
        )
    );

-- Schedules RLS Policies
CREATE POLICY "Users can view schedules for accessible screens" ON schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM screens s 
            WHERE s.id = screen_id AND can_access_location(s.location_id)
        )
    );

CREATE POLICY "Users can manage schedules for accessible screens" ON schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM screens s 
            WHERE s.id = screen_id AND can_access_location(s.location_id)
        ) AND get_user_role() IN ('super_admin', 'district_manager')
    );

-- Device Logs RLS Policies
CREATE POLICY "Users can view logs for accessible screens" ON device_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM screens s 
            WHERE s.id = screen_id AND can_access_location(s.location_id)
        )
    );

CREATE POLICY "System can insert device logs" ON device_logs
    FOR INSERT WITH CHECK (true);

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();