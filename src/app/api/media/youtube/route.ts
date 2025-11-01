import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateYoutubeUrl, fetchYoutubeMetadata, extractYoutubeVideoId } from '@/lib/media-utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

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

    const body = await request.json()
    const { youtube_url, name, description, tags, folder_id, quality = '720p' } = body

    if (!youtube_url) {
      return NextResponse.json({ error: 'No YouTube URL provided' }, { status: 400 })
    }

    // Validate YouTube URL
    if (!validateYoutubeUrl(youtube_url)) {
      return NextResponse.json({
        error: 'Invalid YouTube URL. Please provide a valid YouTube video URL.'
      }, { status: 400 })
    }

    // Fetch video metadata first (for title)
    const metadata = await fetchYoutubeMetadata(youtube_url)

    if (!metadata) {
      return NextResponse.json({
        error: 'Failed to fetch YouTube video information. The video might be private or unavailable.'
      }, { status: 400 })
    }

    // Check if this YouTube video already exists in the organization (and is active)
    const videoId = extractYoutubeVideoId(youtube_url)
    const { data: existingVideo } = await supabase
      .from('media_assets')
      .select('id, name, is_active')
      .eq('organization_id', userProfile.organization_id)
      .eq('youtube_url', youtube_url)
      .eq('is_active', true)  // Only check for active videos
      .single()

    if (existingVideo) {
      return NextResponse.json({
        error: `This YouTube video is already in your media library as "${existingVideo.name}"`
      }, { status: 409 })
    }

    console.log('🎬 Downloading YouTube video:', { videoId, quality })

    // Download the video using the download endpoint
    const downloadResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/media/youtube/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify({ youtube_url, quality })
    })

    if (!downloadResponse.ok) {
      const errorData = await downloadResponse.json()
      console.error('Download failed:', errorData)
      return NextResponse.json({
        error: errorData.error || 'Failed to download YouTube video',
        details: errorData.details
      }, { status: downloadResponse.status })
    }

    const downloadData = await downloadResponse.json()

    console.log('✅ Download complete:', downloadData)

    // Create media asset record with downloaded video file
    const mediaAssetData = {
      organization_id: userProfile.organization_id,
      name: name || metadata.title,
      description: description || null,
      file_name: `${videoId}.mp4`,
      file_path: downloadData.file_path,
      file_url: downloadData.file_url,
      file_size: downloadData.file_size,
      mime_type: 'video/mp4',
      media_type: 'video' as const, // Changed from 'youtube' to 'video' since it's now a file
      duration: downloadData.duration || metadata.duration || null,
      width: downloadData.width || null,
      height: downloadData.height || null,
      resolution: downloadData.width && downloadData.height ? `${downloadData.width}x${downloadData.height}` : null,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)) : null,
      folder_id: folder_id || null,
      youtube_url: youtube_url, // Keep original URL for reference
      is_active: true,
      created_by: user.id,
      thumbnail_url: metadata.thumbnailUrl,
      preview_url: metadata.thumbnailUrl
    }

    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert(mediaAssetData)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({
        error: 'Failed to save YouTube video to media library',
        details: dbError.message
      }, { status: 500 })
    }

    return NextResponse.json(mediaAsset, { status: 201 })

  } catch (error) {
    console.error('Error in YouTube API:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
