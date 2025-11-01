import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type YouTubeQuality } from '@/lib/media-utils'
import { downloadYouTubeVideo } from '@/lib/youtube-download'

/**
 * Download YouTube video and upload to Supabase Storage
 *
 * POST /api/media/youtube/download
 * Body: { youtube_url: string, quality?: '720p' | '1080p' | 'best' }
 *
 * Returns: { file_url: string, duration: number, width: number, height: number, file_size: number }
 */
export async function POST(request: NextRequest) {
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

    // Use shared download function
    const result = await downloadYouTubeVideo(
      supabase,
      userProfile.organization_id,
      youtube_url,
      quality as YouTubeQuality
    )

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('Error in YouTube download API:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to download YouTube video',
      details: error instanceof Error ? error.stack : 'Unknown error'
    }, { status: 500 })
  }
}
