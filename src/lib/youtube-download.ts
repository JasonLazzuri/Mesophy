import { YtdlCore } from '@ybd-project/ytdl-core/serverless'
import { extractYoutubeVideoId } from '@/lib/media-utils'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Readable } from 'stream'

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
 * Convert Node.js stream to Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (err) => reject(err))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * Download YouTube video and upload to Supabase Storage
 * Uses @ybd-project/ytdl-core for serverless compatibility (Vercel)
 */
export async function downloadYouTubeVideo(
  supabase: SupabaseClient,
  organizationId: string,
  youtubeUrl: string,
  quality: '720p' | '1080p' | 'best' = '720p'
): Promise<YouTubeDownloadResult> {
  try {
    const videoId = extractYoutubeVideoId(youtubeUrl)
    if (!videoId) {
      throw new Error('Invalid YouTube URL')
    }

    console.log('📥 Starting YouTube download:', { videoId, quality })

    // Initialize ytdl-core with authentication to bypass bot detection
    // Version 6.0.8+ auto-generates poToken, but we can provide custom ones
    const poToken = process.env.YOUTUBE_PO_TOKEN
    const visitorData = process.env.YOUTUBE_VISITOR_DATA

    const ytdlOptions: any = {
      // Enable detailed logging for debugging
      logDisplay: ["error", "warning", "info"]
    }

    if (poToken && visitorData) {
      console.log('🔐 Using custom poToken authentication')
      ytdlOptions.poToken = poToken
      ytdlOptions.visitorData = visitorData
    } else {
      console.log('🤖 Using auto-generated poToken (ytdl-core v6+)')
      // Let ytdl-core auto-generate poToken
      // This should work in version 6.0.8+
    }

    const ytdl = new YtdlCore(ytdlOptions)

    // Get video info first to extract metadata
    const info = await ytdl.getBasicInfo(youtubeUrl)

    // Extract metadata
    const duration = parseInt(info.videoDetails.lengthSeconds) || 0
    const width = 1280 // Default for 720p
    const height = 720

    console.log('📊 Video metadata:', {
      title: info.videoDetails.title,
      duration,
      videoId: info.videoDetails.videoId
    })

    // Determine quality filter
    let qualityFilter: 'highestvideo' | 'highest' = 'highest'
    if (quality === '720p' || quality === '1080p') {
      qualityFilter = 'highestvideo'
    }

    // Download video stream
    console.log('⬇️ Downloading video stream...')
    const videoStream = ytdl.download(youtubeUrl, {
      quality: qualityFilter,
      filter: 'videoandaudio' // Get combined video+audio
    })

    // Convert stream to buffer
    console.log('💾 Converting stream to buffer...')
    const fileBuffer = await streamToBuffer(videoStream)
    const fileSize = fileBuffer.length

    console.log('✅ Download complete:', { fileSize, duration })

    // Generate storage path
    const storagePath = `${organizationId}/youtube/${videoId}-${Date.now()}.mp4`

    // Upload to Supabase Storage
    console.log('☁️ Uploading to Supabase Storage...')
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

    console.log('✅ Upload complete:', publicUrl)

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
    console.error('Error downloading YouTube video:', error)
    throw error
  }
}
