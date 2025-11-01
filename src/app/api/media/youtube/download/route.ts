import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import youtubedl from 'youtube-dl-exec'
import { extractYoutubeVideoId, YOUTUBE_DOWNLOAD_QUALITY, type YouTubeQuality } from '@/lib/media-utils'
import { randomBytes } from 'crypto'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Download YouTube video and upload to Supabase Storage
 *
 * POST /api/media/youtube/download
 * Body: { youtube_url: string, quality?: '720p' | '1080p' | 'best' }
 *
 * Returns: { file_url: string, duration: number, width: number, height: number, file_size: number }
 */
export async function POST(request: NextRequest) {
  const tempFilePath: string | null = null

  try {
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    const body = await request.json()
    const { youtube_url, quality = '720p' } = body

    if (!youtube_url) {
      return NextResponse.json({ error: 'No YouTube URL provided' }, { status: 400 })
    }

    const videoId = extractYoutubeVideoId(youtube_url)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    // Generate temporary file path
    const tempFileName = `youtube-${videoId}-${randomBytes(8).toString('hex')}.mp4`
    const tempPath = join(tmpdir(), tempFileName)

    console.log('📥 Starting YouTube download:', { videoId, quality, tempPath })

    // Download video using yt-dlp
    const qualityFormat = YOUTUBE_DOWNLOAD_QUALITY[quality as YouTubeQuality] || YOUTUBE_DOWNLOAD_QUALITY['720p']

    try {
      await youtubedl(youtube_url, {
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
      const info = await youtubedl(youtube_url, {
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
    const storagePath = `${userProfile.organization_id}/youtube/${videoId}-${Date.now()}.mp4`

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

    return NextResponse.json({
      file_url: publicUrl,
      file_path: storagePath,
      duration,
      width,
      height,
      file_size: fileSize,
      mime_type: 'video/mp4'
    }, { status: 200 })

  } catch (error) {
    // Clean up temp file on error
    if (tempFilePath) {
      try {
        await unlink(tempFilePath)
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file on error:', cleanupError)
      }
    }

    console.error('Error in YouTube download API:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to download YouTube video',
      details: error instanceof Error ? error.stack : 'Unknown error'
    }, { status: 500 })
  }
}
