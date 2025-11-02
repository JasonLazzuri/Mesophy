import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: playlist, error } = await supabase
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
            height,
            media_type,
            thumbnail_url,
            youtube_url
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
      }
      console.error('Error fetching playlist:', error)
      return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 })
    }

    // Sort playlist items by order_index
    if (playlist.playlist_items) {
      // Debug logging to diagnose ordering issue
      console.log('📋 Playlist items BEFORE sorting:')
      playlist.playlist_items.forEach((item: any, index: number) => {
        console.log(`  ${index}: order_index=${item.order_index}, name=${item.media_assets?.name}, type=${item.media_assets?.mime_type}`)
      })

      playlist.playlist_items.sort((a: any, b: any) => a.order_index - b.order_index)

      console.log('📋 Playlist items AFTER sorting:')
      playlist.playlist_items.forEach((item: any, index: number) => {
        console.log(`  ${index}: order_index=${item.order_index}, name=${item.media_assets?.name}, type=${item.media_assets?.mime_type}`)
      })
    }

    return NextResponse.json({ playlist })
  } catch (error) {
    console.error('Error in playlist GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
    const { name, description, loop_mode, is_active } = body

    // Check if playlist exists and user has permission
    const { data: existingPlaylist, error: fetchError } = await supabase
      .from('playlists')
      .select('id, created_by, organization_id')
      .eq('id', params.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
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
    const canEdit = existingPlaylist.created_by === user.id || 
                   profile.role === 'super_admin' ||
                   existingPlaylist.organization_id === profile.organization_id

    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (loop_mode !== undefined) updateData.loop_mode = loop_mode
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: playlist, error: updateError } = await supabase
      .from('playlists')
      .update(updateData)
      .eq('id', params.id)
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
            media_type,
            thumbnail_url,
            youtube_url
          )
        )
      `)
      .single()

    if (updateError) {
      console.error('Error updating playlist:', updateError)
      return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 })
    }

    return NextResponse.json({ playlist })
  } catch (error) {
    console.error('Error in playlist PUT:', error)
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
    const { data: existingPlaylist, error: fetchError } = await supabase
      .from('playlists')
      .select('id, created_by, organization_id')
      .eq('id', params.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
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
    const canDelete = existingPlaylist.created_by === user.id || 
                     profile.role === 'super_admin'

    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Check if playlist is being used in active schedules
    const { data: activeSchedules, error: scheduleError } = await supabase
      .from('schedules')
      .select('id, name')
      .eq('playlist_id', params.id)
      .eq('is_active', true)

    if (scheduleError) {
      console.error('Error checking schedules:', scheduleError)
      return NextResponse.json({ error: 'Failed to check playlist usage' }, { status: 500 })
    }

    if (activeSchedules && activeSchedules.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete playlist - it is being used in active schedules',
        schedules: activeSchedules
      }, { status: 409 })
    }

    const { error: deleteError } = await supabase
      .from('playlists')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('Error deleting playlist:', deleteError)
      return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Playlist deleted successfully' })
  } catch (error) {
    console.error('Error in playlist DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}