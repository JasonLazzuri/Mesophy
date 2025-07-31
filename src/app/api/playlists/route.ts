import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to determine organization access
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const includeItems = searchParams.get('include_items') === 'true'

    // Build base query
    let query = supabase
      .from('playlists')
      .select(`
        id,
        organization_id,
        name,
        description,
        total_duration,
        loop_mode,
        is_active,
        created_by,
        created_at,
        updated_at
        ${includeItems ? `, playlist_items (
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
            duration
          )
        )` : ''}
      `)
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    const { data: playlists, error } = await query

    if (error) {
      console.error('Error fetching playlists:', error)
      return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 })
    }

    return NextResponse.json({ playlists })
  } catch (error) {
    console.error('Error in playlists GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to determine organization access
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, description, loop_mode = 'loop', media_items = [] } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 })
    }

    // Create playlist
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .insert({
        organization_id: profile.organization_id,
        name: name.trim(),
        description: description?.trim() || null,
        loop_mode,
        created_by: user.id,
        is_active: true
      })
      .select()
      .single()

    if (playlistError) {
      console.error('Error creating playlist:', playlistError)
      return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 })
    }

    // Add media items if provided
    if (media_items.length > 0) {
      const playlistItems = media_items.map((item: any, index: number) => ({
        playlist_id: playlist.id,
        media_asset_id: item.media_asset_id,
        order_index: index,
        duration_override: item.duration_override || null,
        transition_type: item.transition_type || 'fade'
      }))

      const { error: itemsError } = await supabase
        .from('playlist_items')
        .insert(playlistItems)

      if (itemsError) {
        console.error('Error adding playlist items:', itemsError)
        // Clean up playlist if items failed
        await supabase.from('playlists').delete().eq('id', playlist.id)
        return NextResponse.json({ error: 'Failed to add media items to playlist' }, { status: 500 })
      }
    }

    // Fetch the complete playlist with items
    const { data: completePlaylist } = await supabase
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
            duration
          )
        )
      `)
      .eq('id', playlist.id)
      .single()

    return NextResponse.json({ playlist: completePlaylist }, { status: 201 })
  } catch (error) {
    console.error('Error in playlists POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}