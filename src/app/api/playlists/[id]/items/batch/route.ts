import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    id: string
  }
}

interface BatchItem {
  media_asset_id: string
  order_index: number
  duration_override: number | null
  transition_type: string
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { items } = body as { items: BatchItem[] }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Items must be an array' }, { status: 400 })
    }

    // Get user profile to check permissions
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Verify playlist exists and user has permission
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('id, organization_id, created_by')
      .eq('id', params.id)
      .single()

    if (playlistError || !playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }

    // Check permissions
    const canEdit = playlist.created_by === user.id ||
                    profile.role === 'super_admin' ||
                    playlist.organization_id === profile.organization_id

    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Start transaction: Delete all existing items and insert new ones
    // First, delete all existing playlist items
    const { error: deleteError } = await supabase
      .from('playlist_items')
      .delete()
      .eq('playlist_id', params.id)

    if (deleteError) {
      console.error('Error deleting playlist items:', deleteError)
      return NextResponse.json({ error: 'Failed to clear playlist items' }, { status: 500 })
    }

    // If no items to insert, calculate total duration and return
    if (items.length === 0) {
      // Update playlist total_duration to 0
      await supabase
        .from('playlists')
        .update({ total_duration: 0, updated_at: new Date().toISOString() })
        .eq('id', params.id)

      return NextResponse.json({
        message: 'Playlist items cleared successfully',
        total_duration: 0
      })
    }

    // Insert new items
    const playlistItems = items.map(item => ({
      playlist_id: params.id,
      media_asset_id: item.media_asset_id,
      order_index: item.order_index,
      duration_override: item.duration_override,
      transition_type: item.transition_type
    }))

    const { error: insertError } = await supabase
      .from('playlist_items')
      .insert(playlistItems)

    if (insertError) {
      console.error('Error inserting playlist items:', insertError)
      return NextResponse.json({ error: 'Failed to save playlist items' }, { status: 500 })
    }

    // Calculate total duration by fetching media asset durations
    const mediaAssetIds = items.map(item => item.media_asset_id)
    const { data: mediaAssets, error: mediaError } = await supabase
      .from('media_assets')
      .select('id, duration')
      .in('id', mediaAssetIds)

    if (mediaError) {
      console.error('Error fetching media assets for duration:', mediaError)
    }

    // Calculate total duration
    let totalDuration = 0
    items.forEach(item => {
      if (item.duration_override) {
        totalDuration += item.duration_override
      } else {
        const media = mediaAssets?.find(m => m.id === item.media_asset_id)
        totalDuration += media?.duration || 10
      }
    })

    // Update playlist total_duration
    const { error: updateError } = await supabase
      .from('playlists')
      .update({
        total_duration: totalDuration,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('Error updating playlist duration:', updateError)
      return NextResponse.json({ error: 'Failed to update playlist duration' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Playlist items updated successfully',
      total_duration: totalDuration,
      items_count: items.length
    })

  } catch (error) {
    console.error('Error in playlist batch update:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
