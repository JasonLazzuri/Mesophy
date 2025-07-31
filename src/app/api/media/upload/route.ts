import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(uniqueFileName, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('media-assets')
      .getPublicUrl(uniqueFileName)

    // Extract basic metadata
    const mediaType = file.type.startsWith('image/') ? 'image' : 'video'

    // Create media asset record
    const mediaAssetData = {
      organization_id: userProfile.organization_id,
      name: customName || file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      description: description || null,
      file_name: file.name,
      file_path: uniqueFileName,
      file_url: publicUrl,
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
      created_by: user.id
    }

    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert(mediaAssetData)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Clean up uploaded file
      await supabase.storage.from('media-assets').remove([uniqueFileName])
      return NextResponse.json({ error: 'Failed to save media asset' }, { status: 500 })
    }

    return NextResponse.json(mediaAsset, { status: 201 })

  } catch (error) {
    console.error('Error in media upload API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

