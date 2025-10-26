-- ==========================================
-- ADD TECH USER ROLE
-- ==========================================
-- Purpose: Add 'tech' role for technical support staff who can manage
--          devices and content but cannot modify organizational structure
--
-- Permissions:
-- - Screens: UPDATE only (pair devices, configure) - NO create, NO delete
-- - Media/Playlists/Schedules: Full CRUD
-- - Organizations/Districts/Locations/Users: READ only
--
-- Date: 2025-10-24
-- ==========================================

-- Step 1: Add 'tech' to user_role enum
ALTER TYPE user_role ADD VALUE 'tech';

-- ==========================================
-- TECH ROLE RLS POLICIES
-- ==========================================

-- ==========================================
-- ORGANIZATIONS - Read Only
-- ==========================================

CREATE POLICY "Tech users can view their organization" ON organizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = organizations.id
        )
    );

-- ==========================================
-- DISTRICTS - Read Only
-- ==========================================

CREATE POLICY "Tech users can view all districts in organization" ON districts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = districts.organization_id
        )
    );

-- ==========================================
-- LOCATIONS - Read Only
-- ==========================================

CREATE POLICY "Tech users can view all locations in organization" ON locations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND EXISTS (
                SELECT 1 FROM districts d
                WHERE d.id = locations.district_id
                AND d.organization_id = up.organization_id
            )
        )
    );

-- ==========================================
-- SCREENS - UPDATE Only (No Create, No Delete)
-- ==========================================

CREATE POLICY "Tech users can view all screens in organization" ON screens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND EXISTS (
                SELECT 1 FROM locations l
                JOIN districts d ON l.district_id = d.id
                WHERE l.id = screens.location_id
                AND d.organization_id = up.organization_id
            )
        )
    );

CREATE POLICY "Tech users can update screens" ON screens
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND EXISTS (
                SELECT 1 FROM locations l
                JOIN districts d ON l.district_id = d.id
                WHERE l.id = screens.location_id
                AND d.organization_id = up.organization_id
            )
        )
    );

-- Note: Tech users CANNOT INSERT or DELETE screens
-- Only super_admin can create/delete screens

-- ==========================================
-- MEDIA ASSETS - Full CRUD
-- ==========================================

CREATE POLICY "Tech users can view all media in organization" ON media_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_assets.organization_id
        )
    );

CREATE POLICY "Tech users can create media" ON media_assets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_assets.organization_id
        )
    );

CREATE POLICY "Tech users can update media" ON media_assets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_assets.organization_id
        )
    );

CREATE POLICY "Tech users can delete media" ON media_assets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_assets.organization_id
        )
    );

-- ==========================================
-- PLAYLISTS - Full CRUD
-- ==========================================

CREATE POLICY "Tech users can view all playlists in organization" ON playlists
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = playlists.organization_id
        )
    );

CREATE POLICY "Tech users can create playlists" ON playlists
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = playlists.organization_id
        )
    );

CREATE POLICY "Tech users can update playlists" ON playlists
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = playlists.organization_id
        )
    );

CREATE POLICY "Tech users can delete playlists" ON playlists
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = playlists.organization_id
        )
    );

-- ==========================================
-- PLAYLIST_ITEMS - Full CRUD (inherited from playlists)
-- ==========================================

CREATE POLICY "Tech users can view playlist items" ON playlist_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = playlist_items.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can create playlist items" ON playlist_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = playlist_items.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can update playlist items" ON playlist_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = playlist_items.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can delete playlist items" ON playlist_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = playlist_items.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

-- ==========================================
-- SCHEDULES - Full CRUD
-- ==========================================

CREATE POLICY "Tech users can view all schedules in organization" ON schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = schedules.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can create schedules" ON schedules
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = schedules.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can update schedules" ON schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = schedules.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

CREATE POLICY "Tech users can delete schedules" ON schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN playlists p ON p.id = schedules.playlist_id
            WHERE up.id = auth.uid()
            AND up.role = 'tech'
            AND up.organization_id = p.organization_id
        )
    );

-- ==========================================
-- USER_PROFILES - Read Only
-- ==========================================

-- NOTE: Tech users do NOT have a policy to view other users
-- This is intentional to avoid circular reference/infinite recursion issues
-- Any policy that queries user_profiles to check the current user's role
-- creates infinite recursion because checking the policy requires querying
-- the same table the policy protects.
--
-- Tech users can only view their own profile through the existing
-- "Users can view their own profile" policy.
--
-- If tech users need to see other users, this must be implemented at the
-- application layer (API endpoint) rather than through RLS policies.

-- Tech users CANNOT create, update, or delete users
-- Only super_admin can manage users

-- ==========================================
-- MEDIA_FOLDERS - Full CRUD (if needed for media management)
-- ==========================================

CREATE POLICY "Tech users can view media folders" ON media_folders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_folders.organization_id
        )
    );

CREATE POLICY "Tech users can create media folders" ON media_folders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_folders.organization_id
        )
    );

CREATE POLICY "Tech users can update media folders" ON media_folders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_folders.organization_id
        )
    );

CREATE POLICY "Tech users can delete media folders" ON media_folders
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'tech'
            AND user_profiles.organization_id = media_folders.organization_id
        )
    );

-- ==========================================
-- VERIFICATION
-- ==========================================

-- Verify the new role was added
SELECT unnest(enum_range(NULL::user_role)) AS user_roles;

-- Expected output should include: super_admin, district_manager, location_manager, tech
