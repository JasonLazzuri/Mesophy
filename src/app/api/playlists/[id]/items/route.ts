import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    id: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { media_asset_id, duration_override, transition_type = 'fade' } = body

    if (!media_asset_id) {
      return NextResponse.json({ error: 'Media asset ID is required' }, { status: 400 })
    }

    // Check if playlist exists and user has permission
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('id, created_by, organization_id')
      .eq('id', params.id)
      .single()

    if (playlistError) {
      if (playlistError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 })
    }

    // Get user profile for permission check
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check permissions
    const canEdit = playlist.created_by === user.id || 
                   profile.role === 'super_admin' ||
                   playlist.organization_id === profile.organization_id

    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Verify media asset exists and belongs to same organization
    const { data: mediaAsset, error: mediaError } = await supabase
      .from('media_assets')
      .select('id, organization_id')
      .eq('id', media_asset_id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (mediaError || !mediaAsset) {
      return NextResponse.json({ error: 'Media asset not found or access denied' }, { status: 404 })
    }

    // Get current max order_index
    const { data: maxOrderData } = await supabase
      .from('playlist_items')
      .select('order_index')
      .eq('playlist_id', params.id)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = (maxOrderData?.[0]?.order_index || -1) + 1

    // Log the data being inserted for debugging
    const insertData = {
      playlist_id: params.id,
      media_asset_id,
      order_index: nextOrderIndex,
      duration_override,
      transition_type
    }
    console.log('Inserting playlist item:', insertData)

    // Add item to playlist
    const { data: playlistItem, error: insertError } = await supabase
      .from('playlist_items')
      .insert({
        playlist_id: params.id,
        media_asset_id,
        order_index: nextOrderIndex,
        duration_override,
        transition_type
      })
      .select(`
        *,
        media_assets (
          id,
          name,
          file_url,
          mime_type,
          duration,
          width,
          height
        )
      `)
      .single()

    if (insertError) {
      console.error('Error adding playlist item:', insertError)
      return NextResponse.json({ 
        error: 'Failed to add item to playlist',
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint
      }, { status: 500 })
    }

    return NextResponse.json({ playlist_item: playlistItem }, { status: 201 })
  } catch (error) {
    console.error('Error in playlist items POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}