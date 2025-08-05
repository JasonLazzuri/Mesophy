import sharp from 'sharp'

export interface ImageProcessingOptions {
  quality?: number
  format?: 'webp' | 'jpeg' | 'png'
  width?: number
  height?: number
  maintainAspectRatio?: boolean
}

export interface ProcessedImage {
  buffer: Buffer
  format: string
  width: number
  height: number
  size: number
}

export interface MediaProcessingResult {
  thumbnail: ProcessedImage
  preview: ProcessedImage
  optimized: ProcessedImage
  originalSize: number
  compressionRatio: number
}

/**
 * Process an image file to generate thumbnail, preview, and optimized versions
 */
export async function processImage(
  fileBuffer: Buffer,
  originalSize: number
): Promise<MediaProcessingResult> {
  try {
    const image = sharp(fileBuffer)
    const metadata = await image.metadata()
    
    // Generate thumbnail (200x200)
    const thumbnail = await image
      .clone()
      .resize(200, 200, { 
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer()

    // Generate preview (800px max width, maintain aspect ratio)
    const preview = await image
      .clone()
      .resize(800, null, { 
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 85 })
      .toBuffer()

    // Generate optimized version (compress original)
    let optimizedBuffer: Buffer
    let optimizedFormat: string

    if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
      optimizedBuffer = await image
        .clone()
        .jpeg({ 
          quality: 85,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer()
      optimizedFormat = 'jpeg'
    } else if (metadata.format === 'png') {
      optimizedBuffer = await image
        .clone()
        .png({ 
          compressionLevel: 9,
          adaptiveFiltering: true
        })
        .toBuffer()
      optimizedFormat = 'png'
    } else {
      // Convert to WebP for other formats
      optimizedBuffer = await image
        .clone()
        .webp({ quality: 85 })
        .toBuffer()
      optimizedFormat = 'webp'
    }

    const compressionRatio = ((originalSize - optimizedBuffer.length) / originalSize) * 100

    return {
      thumbnail: {
        buffer: thumbnail,
        format: 'webp',
        width: 200,
        height: 200,
        size: thumbnail.length
      },
      preview: {
        buffer: preview,
        format: 'webp',
        width: Math.min(metadata.width || 800, 800),
        height: Math.round((Math.min(metadata.width || 800, 800) * (metadata.height || 1)) / (metadata.width || 1)),
        size: preview.length
      },
      optimized: {
        buffer: optimizedBuffer,
        format: optimizedFormat,
        width: metadata.width || 0,
        height: metadata.height || 0,
        size: optimizedBuffer.length
      },
      originalSize,
      compressionRatio: Math.round(compressionRatio * 100) / 100
    }
  } catch (error) {
    console.error('Error processing image:', error)
    throw new Error('Failed to process image')
  }
}

/**
 * Extract thumbnail from video file (first frame)
 */
export async function extractVideoThumbnail(
  videoBuffer: Buffer
): Promise<Buffer> {
  // For now, return a placeholder since video processing requires ffmpeg
  // This would typically use ffmpeg or similar to extract first frame
  // For MVP, we'll create a simple placeholder
  
  const placeholderSvg = `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#f3f4f6"/>
      <rect x="75" y="75" width="50" height="50" fill="#6366f1"/>
      <polygon points="95,85 95,115 120,100" fill="white"/>
    </svg>
  `
  
  return sharp(Buffer.from(placeholderSvg))
    .png()
    .toBuffer()
}

/**
 * Generate file names for different versions
 */
export function generateOptimizedPaths(originalPath: string, organizationId: string) {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 15)
  const pathWithoutExt = originalPath.replace(/\.[^/.]+$/, '')
  
  return {
    thumbnailPath: `${organizationId}/thumbnails/thumb_${timestamp}-${randomStr}.webp`,
    previewPath: `${organizationId}/previews/preview_${timestamp}-${randomStr}.webp`,
    optimizedPath: `${pathWithoutExt}_optimized_${timestamp}-${randomStr}`
  }
}

/**
 * Get CDN URL for a file path
 */
export function getCdnUrl(filePath: string): string {
  const cdnDomain = process.env.NEXT_PUBLIC_CDN_DOMAIN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  if (cdnDomain) {
    return `https://${cdnDomain}/media-assets/${filePath}`
  }
  
  // Fallback to Supabase storage URL
  return `${supabaseUrl}/storage/v1/object/public/media-assets/${filePath}`
}

/**
 * Check if a file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Check if a file is a video
 */
export function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

/**
 * Get optimized file extension based on format
 */
export function getOptimizedExtension(originalMimeType: string, optimizedFormat: string): string {
  switch (optimizedFormat) {
    case 'webp':
      return '.webp'
    case 'jpeg':
      return '.jpg'
    case 'png':
      return '.png'
    default:
      // Keep original extension as fallback
      const extensions: { [key: string]: string } = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov'
      }
      return extensions[originalMimeType] || '.bin'
  }
}