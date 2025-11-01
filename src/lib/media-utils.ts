import { MediaType } from '@/types/database'

export interface FileMetadata {
  width?: number
  height?: number
  duration?: number
}

export interface FileValidationResult {
  isValid: boolean
  error?: string
}

// File type constants
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'image/webp'
]

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime'
]

export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]

// File size limits
export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

// Optimal resolutions for digital signage
export const OPTIMAL_RESOLUTIONS = {
  landscape: ['1920x1080', '1280x720', '3840x2160'],
  portrait: ['1080x1920', '720x1280', '2160x3840']
}

/**
 * Validate file type and size
 */
export function validateFile(file: File): FileValidationResult {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Unsupported file type. Please use JPG, PNG, GIF, WebP, MP4, WebM, or MOV files.'
    }
  }

  // Check file size
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE

  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024))
    return {
      isValid: false,
      error: `File size too large. Maximum size for ${isImage ? 'images' : 'videos'} is ${maxSizeMB}MB.`
    }
  }

  return { isValid: true }
}

/**
 * Get media type from file
 */
export function getMediaType(file: File): MediaType {
  return file.type.startsWith('image/') ? 'image' : 'video'
}

/**
 * Extract metadata from image file
 */
export function extractImageMetadata(file: File): Promise<FileMetadata> {
  return new Promise((resolve) => {
    const img = new Image()
    
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height
      })
      URL.revokeObjectURL(img.src)
    }
    
    img.onerror = () => {
      resolve({})
      URL.revokeObjectURL(img.src)
    }
    
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Extract metadata from video file
 */
export function extractVideoMetadata(file: File): Promise<FileMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration)
      })
      URL.revokeObjectURL(video.src)
    }
    
    video.onerror = () => {
      resolve({})
      URL.revokeObjectURL(video.src)
    }
    
    video.src = URL.createObjectURL(file)
  })
}

/**
 * Extract metadata from any supported file
 */
export async function extractFileMetadata(file: File): Promise<FileMetadata> {
  const mediaType = getMediaType(file)
  
  if (mediaType === 'image') {
    return extractImageMetadata(file)
  } else if (mediaType === 'video') {
    return extractVideoMetadata(file)
  }
  
  return {}
}

/**
 * Generate unique filename for storage
 */
export function generateUniqueFilename(
  organizationId: string, 
  originalFilename: string
): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 15)
  const fileExt = originalFilename.split('.').pop()
  return `${organizationId}/${timestamp}-${randomStr}.${fileExt}`
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format duration in seconds to readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    
    let result = `${hours}h`
    if (minutes > 0) result += ` ${minutes}m`
    if (remainingSeconds > 0) result += ` ${remainingSeconds}s`
    
    return result
  }
}

/**
 * Check if resolution is optimal for digital signage
 */
export function isOptimalResolution(width: number, height: number): boolean {
  const resolution = `${width}x${height}`
  const isLandscape = width > height
  
  if (isLandscape) {
    return OPTIMAL_RESOLUTIONS.landscape.includes(resolution)
  } else {
    return OPTIMAL_RESOLUTIONS.portrait.includes(resolution)
  }
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

/**
 * Create file preview URL
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Cleanup preview URL
 */
export function cleanupPreviewUrl(url: string): void {
  URL.revokeObjectURL(url)
}

// ========================================
// YouTube Utility Functions
// ========================================

export interface YouTubeMetadata {
  videoId: string
  title: string
  thumbnailUrl: string
  duration?: number
  embedUrl: string
}

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 */
export function extractYoutubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url)

    // Format 1: youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v')
    }

    // Format 2: youtu.be/VIDEO_ID
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1) // Remove leading '/'
    }

    // Format 3: youtube.com/embed/VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/embed/')) {
      return urlObj.pathname.split('/')[2]
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Validate YouTube URL format
 */
export function validateYoutubeUrl(url: string): boolean {
  const videoId = extractYoutubeVideoId(url)
  return videoId !== null && videoId.length > 0
}

/**
 * Get YouTube thumbnail URL from video ID
 */
export function getYoutubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
}

/**
 * Get YouTube embed URL from video ID
 * Includes parameters for fullscreen playback without controls
 */
export function getYoutubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    fs: '0',
    enablejsapi: '1'
  })

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

/**
 * Parse YouTube ISO 8601 duration format (PT1H2M10S) to seconds
 */
function parseYouTubeDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0

  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')

  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Fetch YouTube video metadata using YouTube Data API v3
 * Falls back to oEmbed API if YouTube API key is not configured
 */
export async function fetchYoutubeMetadata(url: string): Promise<YouTubeMetadata | null> {
  try {
    const videoId = extractYoutubeVideoId(url)
    if (!videoId) {
      throw new Error('Invalid YouTube URL')
    }

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY

    // If YouTube API key is configured, use it to get full metadata including duration
    if (apiKey) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${apiKey}`
        const apiResponse = await fetch(apiUrl)

        if (apiResponse.ok) {
          const apiData = await apiResponse.json()

          if (apiData.items && apiData.items.length > 0) {
            const video = apiData.items[0]
            const durationSeconds = parseYouTubeDuration(video.contentDetails.duration)

            return {
              videoId,
              title: video.snippet.title || 'YouTube Video',
              thumbnailUrl: getYoutubeThumbnail(videoId),
              duration: durationSeconds,
              embedUrl: getYoutubeEmbedUrl(videoId)
            }
          }
        }
      } catch (apiError) {
        console.warn('YouTube Data API failed, falling back to oEmbed:', apiError)
      }
    }

    // Fallback to oEmbed API (no duration)
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const response = await fetch(oembedUrl)

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube metadata')
    }

    const data = await response.json()

    return {
      videoId,
      title: data.title || 'YouTube Video',
      thumbnailUrl: getYoutubeThumbnail(videoId),
      // Duration not available without API key - will use default
      duration: undefined,
      embedUrl: getYoutubeEmbedUrl(videoId)
    }
  } catch (error) {
    console.error('Error fetching YouTube metadata:', error)
    return null
  }
}

/**
 * Download YouTube video quality options
 */
export const YOUTUBE_DOWNLOAD_QUALITY = {
  '720p': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
  '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]',
  'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
} as const

export type YouTubeQuality = keyof typeof YOUTUBE_DOWNLOAD_QUALITY