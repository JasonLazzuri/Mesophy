import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    id: string
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { item_orders } = body

    if (!Array.isArray(item_orders)) {
      return NextResponse.json({ error: 'item_orders must be an array' }, { status: 400 })
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

    // Validate that all items belong to this playlist
    const itemIds = item_orders.map(item => item.id)
    const { data: existingItems, error: itemsError } = await supabase
      .from('playlist_items')
      .select('id')
      .eq('playlist_id', params.id)
      .in('id', itemIds)

    if (itemsError) {
      console.error('Error validating playlist items:', itemsError)
      return NextResponse.json({ error: 'Failed to validate playlist items' }, { status: 500 })
    }

    if (existingItems.length !== item_orders.length) {
      return NextResponse.json({ error: 'Invalid playlist items provided' }, { status: 400 })
    }

    // Update order_index for each item
    const updatePromises = item_orders.map((item, index) => 
      supabase
        .from('playlist_items')
        .update({ order_index: index })
        .eq('id', item.id)
        .eq('playlist_id', params.id)
    )

    const results = await Promise.all(updatePromises)
    
    // Check if any updates failed
    const failedUpdates = results.filter(result => result.error)
    if (failedUpdates.length > 0) {
      console.error('Some playlist item updates failed:', failedUpdates)
      return NextResponse.json({ error: 'Failed to reorder some playlist items' }, { status: 500 })
    }

    // Fetch updated playlist with items
    const { data: updatedPlaylist, error: fetchError } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_items (
          id,
          media_asset_id,
          order_index,
          duration_override,
          transition_type,
          media_assets (
            id,
            name,
            file_url,
            mime_type,
            duration,
            width,
            height
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (fetchError) {
      console.error('Error fetching updated playlist:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch updated playlist' }, { status: 500 })
    }

    // Sort playlist items by order_index
    if (updatedPlaylist.playlist_items) {
      updatedPlaylist.playlist_items.sort((a: any, b: any) => a.order_index - b.order_index)
    }

    return NextResponse.json({ playlist: updatedPlaylist })
  } catch (error) {
    console.error('Error in playlist reorder PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}