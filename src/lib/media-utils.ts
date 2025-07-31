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