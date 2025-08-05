import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  processImage, 
  extractVideoThumbnail, 
  generateOptimizedPaths, 
  getCdnUrl, 
  isImageFile, 
  isVideoFile,
  getOptimizedExtension
} from '@/lib/media-optimization'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const formData = await request.formData()
    
    // Get user's organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    const file = formData.get('file') as File
    const folderId = formData.get('folder_id') as string || null
    const customName = formData.get('name') as string || ''
    const description = formData.get('description') as string || ''
    const tags = formData.get('tags') as string || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Unsupported file type. Please use JPG, PNG, GIF, WebP, MP4, WebM, or MOV files.' 
      }, { status: 400 })
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size too large. Maximum size is 50MB.' 
      }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileExt = file.name.split('.').pop()
    const uniqueFileName = `${userProfile.organization_id}/${timestamp}-${randomStr}.${fileExt}`

    // Convert file to buffer for processing
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const mediaType = file.type.startsWith('image/') ? 'image' : 'video'

    // Initialize variables for optimization data
    let thumbnailUrl = null
    let thumbnailPath = null
    let previewUrl = null
    let previewPath = null
    let optimizedUrl = null
    let optimizedPath = null
    let compressionRatio = null
    let processingStatus = 'completed'

    try {
      // Process images for optimization
      if (isImageFile(file.type)) {
        console.log('Processing image for optimization...')
        const processed = await processImage(fileBuffer, file.size)
        const paths = generateOptimizedPaths(uniqueFileName, userProfile.organization_id)

        // Upload thumbnail
        const { error: thumbError } = await supabase.storage
          .from('media-assets')
          .upload(paths.thumbnailPath, processed.thumbnail.buffer, {
            contentType: 'image/webp',
            upsert: false
          })

        if (!thumbError) {
          thumbnailPath = paths.thumbnailPath
          thumbnailUrl = getCdnUrl(paths.thumbnailPath)
        }

        // Upload preview
        const { error: previewError } = await supabase.storage
          .from('media-assets')
          .upload(paths.previewPath, processed.preview.buffer, {
            contentType: 'image/webp',
            upsert: false
          })

        if (!previewError) {
          previewPath = paths.previewPath
          previewUrl = getCdnUrl(paths.previewPath)
        }

        // Upload optimized version
        const optimizedExt = getOptimizedExtension(file.type, processed.optimized.format)
        const optimizedFileName = paths.optimizedPath + optimizedExt
        
        const { error: optimizedError } = await supabase.storage
          .from('media-assets')
          .upload(optimizedFileName, processed.optimized.buffer, {
            contentType: `image/${processed.optimized.format}`,
            upsert: false
          })

        if (!optimizedError) {
          optimizedPath = optimizedFileName
          optimizedUrl = getCdnUrl(optimizedFileName)
          compressionRatio = processed.compressionRatio
        }

        console.log('Image processing completed:', {
          originalSize: file.size,
          thumbnailSize: processed.thumbnail.size,
          previewSize: processed.preview.size,
          optimizedSize: processed.optimized.size,
          compressionRatio: processed.compressionRatio
        })

      } else if (isVideoFile(file.type)) {
        console.log('Processing video thumbnail...')
        try {
          const thumbnailBuffer = await extractVideoThumbnail(fileBuffer)
          const paths = generateOptimizedPaths(uniqueFileName, userProfile.organization_id)

          const { error: thumbError } = await supabase.storage
            .from('media-assets')
            .upload(paths.thumbnailPath, thumbnailBuffer, {
              contentType: 'image/png',
              upsert: false
            })

          if (!thumbError) {
            thumbnailPath = paths.thumbnailPath
            thumbnailUrl = getCdnUrl(paths.thumbnailPath)
          }
        } catch (error) {
          console.warn('Video thumbnail generation failed:', error)
          processingStatus = 'failed'
        }
      }
    } catch (error) {
      console.error('Media processing error:', error)
      processingStatus = 'failed'
    }

    // Upload original file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(uniqueFileName, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // Clean up any processed files
      if (thumbnailPath) await supabase.storage.from('media-assets').remove([thumbnailPath])
      if (previewPath) await supabase.storage.from('media-assets').remove([previewPath])
      if (optimizedPath) await supabase.storage.from('media-assets').remove([optimizedPath])
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get CDN URLs
    const fileUrl = getCdnUrl(uniqueFileName)

    // Create media asset record with optimization data
    const mediaAssetData = {
      organization_id: userProfile.organization_id,
      name: customName || file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      description: description || null,
      file_name: file.name,
      file_path: uniqueFileName,
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.type,
      media_type: mediaType,
      duration: null, // Will be updated on client side if needed
      width: null,
      height: null,
      resolution: null,
      tags: tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : null,
      folder_id: folderId || null,
      is_active: true,
      created_by: user.id,
      // Optimization fields
      thumbnail_url: thumbnailUrl,
      thumbnail_path: thumbnailPath,
      preview_url: previewUrl,
      preview_path: previewPath,
      optimized_url: optimizedUrl,
      optimized_path: optimizedPath,
      original_file_size: file.size,
      compressed_file_size: optimizedPath ? null : file.size, // Will be updated if optimization succeeded
      compression_ratio: compressionRatio,
      processing_status: processingStatus,
      cdn_enabled: true
    }

    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert(mediaAssetData)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Clean up uploaded files
      await supabase.storage.from('media-assets').remove([uniqueFileName])
      if (thumbnailPath) await supabase.storage.from('media-assets').remove([thumbnailPath])
      if (previewPath) await supabase.storage.from('media-assets').remove([previewPath])
      if (optimizedPath) await supabase.storage.from('media-assets').remove([optimizedPath])
      return NextResponse.json({ error: 'Failed to save media asset' }, { status: 500 })
    }

    return NextResponse.json(mediaAsset, { status: 201 })

  } catch (error) {
    console.error('Error in media upload API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

