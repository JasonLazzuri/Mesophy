import youtubedl from 'youtube-dl-exec'
import { extractYoutubeVideoId, YOUTUBE_DOWNLOAD_QUALITY, type YouTubeQuality } from '@/lib/media-utils'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface YouTubeDownloadResult {
  file_url: string
  file_path: string
  duration: number
  width: number
  height: number
  file_size: number
  mime_type: string
}

/**
 * Download YouTube video and upload to Supabase Storage
 * This is a shared function used by both the API route and direct calls
 */
export async function downloadYouTubeVideo(
  supabase: SupabaseClient,
  organizationId: string,
  youtubeUrl: string,
  quality: YouTubeQuality = '720p'
): Promise<YouTubeDownloadResult> {
  let tempPath: string | null = null

  try {
    const videoId = extractYoutubeVideoId(youtubeUrl)
    if (!videoId) {
      throw new Error('Invalid YouTube URL')
    }

    // Generate temporary file path
    const tempFileName = `youtube-${videoId}-${randomBytes(8).toString('hex')}.mp4`
    tempPath = join(tmpdir(), tempFileName)

    console.log('📥 Starting YouTube download:', { videoId, quality, tempPath })

    // Download video using yt-dlp
    const qualityFormat = YOUTUBE_DOWNLOAD_QUALITY[quality] || YOUTUBE_DOWNLOAD_QUALITY['720p']

    try {
      await youtubedl(youtubeUrl, {
        format: qualityFormat,
        output: tempPath,
        noPlaylist: true,
        // Merge video and audio into single MP4
        mergeOutputFormat: 'mp4',
        // Ensure we get proper metadata
        writeInfoJson: false,
        // Don't include extra files
        noWriteThumbnail: true,
        noWriteDescription: true,
        noWriteAnnotations: true,
      })
    } catch (dlError) {
      console.error('YouTube download failed:', dlError)
      throw new Error('Failed to download video. The video might be private, age-restricted, or unavailable.')
    }

    // Get video metadata using yt-dlp
    let duration = 0
    let width = 1920
    let height = 1080

    try {
      const info = await youtubedl(youtubeUrl, {
        dumpSingleJson: true,
        noPlaylist: true,
        format: qualityFormat
      })

      if (info.duration) {
        duration = Math.round(info.duration)
      }
      if (info.width && info.height) {
        width = info.width
        height = info.height
      }
    } catch (infoError) {
      console.warn('Failed to extract video metadata, using defaults:', infoError)
    }

    // Read the downloaded file
    const fs = await import('fs/promises')
    const fileBuffer = await fs.readFile(tempPath)
    const fileSize = fileBuffer.length

    console.log('✅ Download complete:', { fileSize, duration, width, height })

    // Generate storage path
    const storagePath = `${organizationId}/youtube/${videoId}-${Date.now()}.mp4`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('media')
      .upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: false
      })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      throw new Error(`Failed to upload video to storage: ${uploadError.message}`)
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('media')
      .getPublicUrl(storagePath)

    console.log('☁️ Uploaded to Supabase:', publicUrl)

    // Clean up temp file
    try {
      await fs.unlink(tempPath)
      console.log('🧹 Cleaned up temp file')
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError)
    }

    return {
      file_url: publicUrl,
      file_path: storagePath,
      duration,
      width,
      height,
      file_size: fileSize,
      mime_type: 'video/mp4'
    }

  } catch (error) {
    // Clean up temp file on error
    if (tempPath) {
      try {
        const fs = await import('fs/promises')
        await fs.unlink(tempPath)
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file on error:', cleanupError)
      }
    }

    throw error
  }
}
