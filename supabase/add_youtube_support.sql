-- Add YouTube Video Support to Media Assets
-- This migration adds the ability to include YouTube videos in playlists

-- Step 1: Add youtube_url column to media_assets table
ALTER TABLE media_assets
ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- Step 2: Add 'youtube' to media_type enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public'
        AND t.typname = 'media_type'
        AND e.enumlabel = 'youtube'
    ) THEN
        ALTER TYPE media_type ADD VALUE 'youtube';
    END IF;
END $$;

-- Step 3: Make file_url and file_name nullable (YouTube videos don't need uploaded files)
ALTER TABLE media_assets
ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE media_assets
ALTER COLUMN file_name DROP NOT NULL;

-- Step 4: Add check constraint to ensure either file_url or youtube_url is present
ALTER TABLE media_assets
ADD CONSTRAINT media_asset_source_check
CHECK (
    (file_url IS NOT NULL AND youtube_url IS NULL) OR
    (file_url IS NULL AND youtube_url IS NOT NULL)
);

-- Step 5: Add index on youtube_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_media_assets_youtube_url
ON media_assets(youtube_url)
WHERE youtube_url IS NOT NULL;

-- Step 6: Add comment to document the new functionality
COMMENT ON COLUMN media_assets.youtube_url IS
'YouTube video URL for embedded playback. If present, file_url should be null.';

-- Migration complete!
-- YouTube videos can now be added to playlists by storing the YouTube URL
