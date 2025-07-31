-- Create storage bucket for media files
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'media-assets',
  'media-assets',
  true,
  false,
  52428800, -- 50MB file size limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media assets bucket
-- Policy 1: Allow authenticated users to view media from their organization
CREATE POLICY "Users can view media from their organization" ON storage.objects
FOR SELECT USING (
  bucket_id = 'media-assets' AND
  EXISTS (
    SELECT 1 FROM media_assets ma
    JOIN user_profiles up ON up.organization_id = ma.organization_id
    WHERE ma.file_path = name AND up.id = auth.uid()
  )
);

-- Policy 2: Allow authenticated users to upload media to their organization
CREATE POLICY "Users can upload media to their organization" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'media-assets' AND
  auth.role() = 'authenticated'
);

-- Policy 3: Allow users to update media from their organization
CREATE POLICY "Users can update media from their organization" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'media-assets' AND
  EXISTS (
    SELECT 1 FROM media_assets ma
    JOIN user_profiles up ON up.organization_id = ma.organization_id
    WHERE ma.file_path = name AND up.id = auth.uid()
  )
);

-- Policy 4: Allow users to delete media from their organization
CREATE POLICY "Users can delete media from their organization" ON storage.objects
FOR DELETE USING (
  bucket_id = 'media-assets' AND
  EXISTS (
    SELECT 1 FROM media_assets ma
    JOIN user_profiles up ON up.organization_id = ma.organization_id
    WHERE ma.file_path = name AND up.id = auth.uid()
  )
);

-- RLS policies for media_assets table
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- Users can only see media from their organization
CREATE POLICY "Users can view media from their organization" ON media_assets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_assets.organization_id
  )
);

-- Users can insert media to their organization
CREATE POLICY "Users can create media for their organization" ON media_assets
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_assets.organization_id
  )
);

-- Users can update media from their organization
CREATE POLICY "Users can update media from their organization" ON media_assets
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_assets.organization_id
  )
);

-- Users can delete media from their organization
CREATE POLICY "Users can delete media from their organization" ON media_assets
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_assets.organization_id
  )
);

-- RLS policies for media_folders table
ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;

-- Users can only see folders from their organization
CREATE POLICY "Users can view folders from their organization" ON media_folders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_folders.organization_id
  )
);

-- Users can create folders for their organization
CREATE POLICY "Users can create folders for their organization" ON media_folders
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_folders.organization_id
  )
);

-- Users can update folders from their organization
CREATE POLICY "Users can update folders from their organization" ON media_folders
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_folders.organization_id
  )
);

-- Users can delete folders from their organization
CREATE POLICY "Users can delete folders from their organization" ON media_folders
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.organization_id = media_folders.organization_id
  )
);