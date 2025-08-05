-- Media Optimization Schema Updates
-- Add thumbnail and optimization fields to media_assets table

-- Add columns for thumbnail and optimized versions
ALTER TABLE media_assets 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
ADD COLUMN IF NOT EXISTS preview_url TEXT,
ADD COLUMN IF NOT EXISTS preview_path TEXT,
ADD COLUMN IF NOT EXISTS optimized_url TEXT,
ADD COLUMN IF NOT EXISTS optimized_path TEXT,
ADD COLUMN IF NOT EXISTS original_file_size BIGINT,
ADD COLUMN IF NOT EXISTS compressed_file_size BIGINT,
ADD COLUMN IF NOT EXISTS compression_ratio DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS cdn_enabled BOOLEAN DEFAULT false;

-- Add index for faster queries on processing status
CREATE INDEX IF NOT EXISTS idx_media_assets_processing_status 
ON media_assets(processing_status);

-- Add index for CDN enabled assets
CREATE INDEX IF NOT EXISTS idx_media_assets_cdn_enabled 
ON media_assets(cdn_enabled);

-- Update storage policies to include thumbnail access
-- Policy for thumbnail access in storage
CREATE POLICY IF NOT EXISTS "Users can view thumbnails from their organization" ON storage.objects
FOR SELECT USING (
  bucket_id = 'media-assets' AND
  (
    -- Allow access to thumbnails (paths containing 'thumb_' or 'preview_')
    name LIKE '%thumb_%' OR 
    name LIKE '%preview_%' OR
    name LIKE '%optimized_%' OR
    EXISTS (
      SELECT 1 FROM media_assets ma
      JOIN user_profiles up ON up.organization_id = ma.organization_id
      WHERE (ma.file_path = name OR ma.thumbnail_path = name OR ma.preview_path = name OR ma.optimized_path = name)
      AND up.id = auth.uid()
    )
  )
);

-- Create a function to get CDN URL based on configuration
CREATE OR REPLACE FUNCTION get_media_url(file_path TEXT, url_type TEXT DEFAULT 'original')
RETURNS TEXT AS $$
DECLARE
  base_url TEXT;
  cdn_domain TEXT;
BEGIN
  -- Get CDN domain from environment or use Supabase storage URL
  cdn_domain := current_setting('app.cdn_domain', true);
  
  IF cdn_domain IS NULL OR cdn_domain = '' THEN
    -- Use Supabase storage URL
    base_url := current_setting('app.supabase_url', true) || '/storage/v1/object/public/media-assets/';
  ELSE
    -- Use CDN domain
    base_url := 'https://' || cdn_domain || '/media-assets/';
  END IF;
  
  RETURN base_url || file_path;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN media_assets.thumbnail_url IS 'CDN URL for 200x200px thumbnail';
COMMENT ON COLUMN media_assets.thumbnail_path IS 'Storage path for thumbnail file';
COMMENT ON COLUMN media_assets.preview_url IS 'CDN URL for 800px preview image';
COMMENT ON COLUMN media_assets.preview_path IS 'Storage path for preview file';
COMMENT ON COLUMN media_assets.optimized_url IS 'CDN URL for optimized/compressed original';
COMMENT ON COLUMN media_assets.optimized_path IS 'Storage path for optimized file';
COMMENT ON COLUMN media_assets.compression_ratio IS 'Compression ratio as percentage (e.g., 75.5 for 75.5% compression)';
COMMENT ON COLUMN media_assets.processing_status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN media_assets.cdn_enabled IS 'Whether this asset is available via CDN';