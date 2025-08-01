-- Safe migration that handles existing constraints and tables

-- Add missing fields to media_assets table (only if they don't exist)
DO $$
BEGIN
    -- Add description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'description') THEN
        ALTER TABLE media_assets ADD COLUMN description TEXT;
    END IF;
    
    -- Add file_path column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'file_path') THEN
        ALTER TABLE media_assets ADD COLUMN file_path TEXT;
    END IF;
    
    -- Add media_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'media_type') THEN
        ALTER TABLE media_assets ADD COLUMN media_type TEXT CHECK (media_type IN ('image', 'video'));
    END IF;
    
    -- Add resolution column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'resolution') THEN
        ALTER TABLE media_assets ADD COLUMN resolution TEXT;
    END IF;
    
    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'is_active') THEN
        ALTER TABLE media_assets ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    -- Add folder_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media_assets' AND column_name = 'folder_id') THEN
        ALTER TABLE media_assets ADD COLUMN folder_id UUID;
    END IF;
END $$;

-- Create media_folders table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS media_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_folder_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_media_assets_folder_id' 
                   AND table_name = 'media_assets') THEN
        ALTER TABLE media_assets 
        ADD CONSTRAINT fk_media_assets_folder_id 
        FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_media_assets_folder_id ON media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_media_type ON media_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_is_active ON media_assets(is_active);
CREATE INDEX IF NOT EXISTS idx_media_folders_organization_id ON media_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent_folder_id ON media_folders(parent_folder_id);

-- Add update trigger for media_folders (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_media_folders_updated_at') THEN
        CREATE TRIGGER update_media_folders_updated_at 
        BEFORE UPDATE ON media_folders 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Populate media_type for existing records (if any)
UPDATE media_assets 
SET media_type = CASE 
    WHEN mime_type LIKE 'image/%' THEN 'image'
    WHEN mime_type LIKE 'video/%' THEN 'video'
    ELSE 'image'
END 
WHERE media_type IS NULL;

-- Populate resolution from width and height for existing records
UPDATE media_assets 
SET resolution = CONCAT(width, 'x', height)
WHERE resolution IS NULL AND width IS NOT NULL AND height IS NOT NULL;