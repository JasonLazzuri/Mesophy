-- Add missing fields to media_assets table
ALTER TABLE media_assets 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT, -- Supabase storage path
ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video')),
ADD COLUMN IF NOT EXISTS resolution TEXT, -- "1920x1080" format
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS folder_id UUID;

-- Create media_folders table
CREATE TABLE IF NOT EXISTS media_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_folder_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint for folder_id in media_assets
ALTER TABLE media_assets 
ADD CONSTRAINT fk_media_assets_folder_id 
FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_media_assets_folder_id ON media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_media_type ON media_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_is_active ON media_assets(is_active);
CREATE INDEX IF NOT EXISTS idx_media_folders_organization_id ON media_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent_folder_id ON media_folders(parent_folder_id);

-- Add update trigger for media_folders
CREATE TRIGGER update_media_folders_updated_at 
BEFORE UPDATE ON media_folders 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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