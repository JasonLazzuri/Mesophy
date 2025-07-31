-- Enhanced Scheduling System Schema
-- This builds upon the existing schema with comprehensive playlist and scheduling features

-- Add new enum types for scheduling system
CREATE TYPE loop_mode AS ENUM ('loop', 'once', 'shuffle');
CREATE TYPE transition_type AS ENUM ('fade', 'slide', 'cut', 'dissolve');

-- Drop existing playlists table to recreate with enhanced features
DROP TABLE IF EXISTS playlist_items CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;

-- Enhanced playlists table
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    total_duration INTEGER DEFAULT 0, -- calculated duration in seconds
    loop_mode loop_mode DEFAULT 'loop',
    created_by UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced playlist_items table
CREATE TABLE playlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    duration_override INTEGER, -- custom duration in seconds, null for default
    transition_type transition_type DEFAULT 'fade',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced schedules table  
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    screen_id UUID REFERENCES screens(id) ON DELETE CASCADE, -- null for multiple screens
    start_date DATE NOT NULL,
    end_date DATE, -- optional end date
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6], -- 0=Sunday, 1=Monday, etc.
    timezone VARCHAR(100) DEFAULT 'UTC',
    priority INTEGER DEFAULT 1, -- higher number = higher priority
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Screen schedules many-to-many relationship table
CREATE TABLE screen_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_id, screen_id)
);

-- Create indexes for better performance
CREATE INDEX idx_playlists_organization_id ON playlists(organization_id);
CREATE INDEX idx_playlists_created_by ON playlists(created_by);
CREATE INDEX idx_playlists_is_active ON playlists(is_active);

CREATE INDEX idx_playlist_items_playlist_id ON playlist_items(playlist_id);
CREATE INDEX idx_playlist_items_media_asset_id ON playlist_items(media_asset_id);
CREATE INDEX idx_playlist_items_order_index ON playlist_items(order_index);

CREATE INDEX idx_schedules_organization_id ON schedules(organization_id);
CREATE INDEX idx_schedules_playlist_id ON schedules(playlist_id);
CREATE INDEX idx_schedules_screen_id ON schedules(screen_id);
CREATE INDEX idx_schedules_start_date ON schedules(start_date);
CREATE INDEX idx_schedules_end_date ON schedules(end_date);
CREATE INDEX idx_schedules_is_active ON schedules(is_active);
CREATE INDEX idx_schedules_priority ON schedules(priority);

CREATE INDEX idx_screen_schedules_schedule_id ON screen_schedules(schedule_id);
CREATE INDEX idx_screen_schedules_screen_id ON screen_schedules(screen_id);

-- Function to calculate playlist total duration
CREATE OR REPLACE FUNCTION calculate_playlist_duration(playlist_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    total_duration INTEGER := 0;
    item_duration INTEGER;
    media_duration INTEGER;
BEGIN
    FOR item_duration, media_duration IN
        SELECT 
            COALESCE(pi.duration_override, ma.duration, 10) as item_duration,
            ma.duration
        FROM playlist_items pi
        JOIN media_assets ma ON pi.media_asset_id = ma.id
        WHERE pi.playlist_id = playlist_uuid
        ORDER BY pi.order_index
    LOOP
        total_duration := total_duration + item_duration;
    END LOOP;
    
    RETURN total_duration;
END;
$$ LANGUAGE plpgsql;

-- Function to update playlist total duration when items change
CREATE OR REPLACE FUNCTION update_playlist_duration()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE playlists 
    SET total_duration = calculate_playlist_duration(
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.playlist_id
            ELSE NEW.playlist_id
        END
    ),
    updated_at = NOW()
    WHERE id = (
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.playlist_id
            ELSE NEW.playlist_id
        END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update playlist duration
CREATE TRIGGER update_playlist_duration_on_items_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_items
    FOR EACH ROW EXECUTE FUNCTION update_playlist_duration();

-- Apply update triggers to new tables
CREATE TRIGGER update_playlists_updated_at 
    BEFORE UPDATE ON playlists 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at 
    BEFORE UPDATE ON schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check for schedule conflicts
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    schedule_uuid UUID,
    p_screen_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_days_of_week INTEGER[],
    p_priority INTEGER
)
RETURNS TABLE(
    conflicting_schedule_id UUID,
    conflicting_schedule_name VARCHAR,
    conflict_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        CASE 
            WHEN s.priority = p_priority THEN 'same_priority'
            WHEN s.priority > p_priority THEN 'higher_priority'
            ELSE 'lower_priority'
        END as conflict_type
    FROM schedules s
    WHERE s.id != COALESCE(schedule_uuid, '00000000-0000-0000-0000-000000000000'::UUID)
        AND s.is_active = true
        AND (s.screen_id = p_screen_id OR s.screen_id IS NULL OR p_screen_id IS NULL)
        AND (
            -- Date range overlap
            (s.end_date IS NULL OR s.end_date >= p_start_date) AND
            (p_end_date IS NULL OR s.start_date <= p_end_date)
        )
        AND (
            -- Time overlap
            (s.start_time < p_end_time AND s.end_time > p_start_time)
        )
        AND (
            -- Days of week overlap
            s.days_of_week && p_days_of_week
        );
END;
$$ LANGUAGE plpgsql;

-- Function to get active schedules for a screen at a specific time
CREATE OR REPLACE FUNCTION get_active_schedules_for_screen(
    p_screen_id UUID,
    p_datetime TIMESTAMPTZ
)
RETURNS TABLE(
    schedule_id UUID,
    schedule_name VARCHAR,
    playlist_id UUID,
    playlist_name VARCHAR,
    priority INTEGER
) AS $$
DECLARE
    p_date DATE := p_datetime::DATE;
    p_time TIME := p_datetime::TIME;
    p_day_of_week INTEGER := EXTRACT(DOW FROM p_datetime)::INTEGER;
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.playlist_id,
        p.name,
        s.priority
    FROM schedules s
    JOIN playlists p ON s.playlist_id = p.id
    WHERE s.is_active = true
        AND (s.screen_id = p_screen_id OR s.screen_id IS NULL)
        AND s.start_date <= p_date
        AND (s.end_date IS NULL OR s.end_date >= p_date)
        AND s.start_time <= p_time
        AND s.end_time > p_time
        AND p_day_of_week = ANY(s.days_of_week)
    ORDER BY s.priority DESC, s.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies for new tables

-- Playlists policies
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view playlists in their organization" ON playlists
    FOR SELECT USING (
        organization_id IN (
            SELECT CASE 
                WHEN (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin' 
                THEN organization_id
                ELSE (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
            END
        )
    );

CREATE POLICY "Users can create playlists in their organization" ON playlists
    FOR INSERT WITH CHECK (
        organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can update playlists they created or have access to" ON playlists
    FOR UPDATE USING (
        created_by = auth.uid() OR
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin' OR
        organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can delete playlists they created or have admin access" ON playlists
    FOR DELETE USING (
        created_by = auth.uid() OR
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- Playlist items policies
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view playlist items in their organization" ON playlist_items
    FOR SELECT USING (
        playlist_id IN (
            SELECT id FROM playlists WHERE organization_id = (
                SELECT organization_id FROM user_profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can manage playlist items" ON playlist_items
    FOR ALL USING (
        playlist_id IN (
            SELECT id FROM playlists WHERE organization_id = (
                SELECT organization_id FROM user_profiles WHERE id = auth.uid()
            )
        )
    );

-- Schedules policies
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in their organization" ON schedules
    FOR SELECT USING (
        organization_id IN (
            SELECT CASE 
                WHEN (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin' 
                THEN organization_id
                ELSE (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
            END
        )
    );

CREATE POLICY "Users can create schedules in their organization" ON schedules
    FOR INSERT WITH CHECK (
        organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can update schedules they created or have access to" ON schedules
    FOR UPDATE USING (
        created_by = auth.uid() OR
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin' OR
        organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can delete schedules they created or have admin access" ON schedules
    FOR DELETE USING (
        created_by = auth.uid() OR
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- Screen schedules policies
ALTER TABLE screen_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view screen schedules for their organization" ON screen_schedules
    FOR SELECT USING (
        schedule_id IN (
            SELECT id FROM schedules WHERE organization_id = (
                SELECT organization_id FROM user_profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can manage screen schedules" ON screen_schedules
    FOR ALL USING (
        schedule_id IN (
            SELECT id FROM schedules WHERE organization_id = (
                SELECT organization_id FROM user_profiles WHERE id = auth.uid()
            )
        )
    );