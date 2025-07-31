import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    id: string
    itemId: string
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
    const { duration_override, transition_type } = body

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

    // Verify playlist item exists and belongs to this playlist
    const { data: existingItem, error: itemError } = await supabase
      .from('playlist_items')
      .select('id')
      .eq('id', params.itemId)
      .eq('playlist_id', params.id)
      .single()

    if (itemError || !existingItem) {
      return NextResponse.json({ error: 'Playlist item not found' }, { status: 404 })
    }

    const updateData: any = {}
    if (duration_override !== undefined) updateData.duration_override = duration_override
    if (transition_type !== undefined) updateData.transition_type = transition_type

    const { data: playlistItem, error: updateError } = await supabase
      .from('playlist_items')
      .update(updateData)
      .eq('id', params.itemId)
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

    if (updateError) {
      console.error('Error updating playlist item:', updateError)
      return NextResponse.json({ error: 'Failed to update playlist item' }, { status: 500 })
    }

    return NextResponse.json({ playlist_item: playlistItem })
  } catch (error) {
    console.error('Error in playlist item PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Get the item to be deleted for order_index
    const { data: itemToDelete, error: fetchError } = await supabase
      .from('playlist_items')
      .select('id, order_index')
      .eq('id', params.itemId)
      .eq('playlist_id', params.id)
      .single()

    if (fetchError || !itemToDelete) {
      return NextResponse.json({ error: 'Playlist item not found' }, { status: 404 })
    }

    // Delete the item
    const { error: deleteError } = await supabase
      .from('playlist_items')
      .delete()
      .eq('id', params.itemId)

    if (deleteError) {
      console.error('Error deleting playlist item:', deleteError)
      return NextResponse.json({ error: 'Failed to delete playlist item' }, { status: 500 })
    }

    // Reorder remaining items to fill the gap
    const { data: remainingItems, error: remainingError } = await supabase
      .from('playlist_items')
      .select('id, order_index')
      .eq('playlist_id', params.id)
      .gt('order_index', itemToDelete.order_index)
      .order('order_index')

    if (remainingError) {
      console.error('Error fetching remaining items:', remainingError)
    } else if (remainingItems && remainingItems.length > 0) {
      // Update order_index for remaining items
      const updatePromises = remainingItems.map(item => 
        supabase
          .from('playlist_items')
          .update({ order_index: item.order_index - 1 })
          .eq('id', item.id)
      )

      await Promise.all(updatePromises)
    }

    return NextResponse.json({ message: 'Playlist item deleted successfully' })
  } catch (error) {
    console.error('Error in playlist item DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}