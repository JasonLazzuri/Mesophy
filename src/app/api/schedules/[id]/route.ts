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

    const { data: schedule, error } = await supabase
      .from('schedules')
      .select(`
        *,
        playlists (
          id,
          name,
          total_duration,
          loop_mode,
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
        ),
        screens (
          id,
          name,
          location_id,
          locations (
            id,
            name,
            district_id,
            districts (
              id,
              name
            )
          )
        ),
        screen_schedules (
          screen_id,
          screens (
            id,
            name,
            location_id,
            locations (
              id,
              name,
              district_id,
              districts (
                id,
                name
              )
            )
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }
      console.error('Error fetching schedule:', error)
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
    }

    // Sort playlist items by order_index
    if (schedule.playlists?.playlist_items) {
      schedule.playlists.playlist_items.sort((a: any, b: any) => a.order_index - b.order_index)
    }

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error in schedule GET:', error)
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
    const {
      name,
      playlist_id,
      screen_id,
      screen_ids = [],
      target_screen_types,
      target_locations,
      start_date,
      end_date,
      start_time,
      end_time,
      days_of_week,
      timezone,
      priority,
      is_active
    } = body

    // Check if schedule exists and user has permission
    const { data: existingSchedule, error: fetchError } = await supabase
      .from('schedules')
      .select('id, created_by, organization_id')
      .eq('id', params.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
    }

    // Get user profile for permission check
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check permissions
    const canEdit = existingSchedule.created_by === user.id || 
                   profile.role === 'super_admin' ||
                   existingSchedule.organization_id === profile.organization_id

    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Validate playlist if being updated
    if (playlist_id) {
      const { data: playlist, error: playlistError } = await supabase
        .from('playlists')
        .select('id, organization_id')
        .eq('id', playlist_id)
        .eq('organization_id', profile.organization_id)
        .single()

      if (playlistError || !playlist) {
        return NextResponse.json({ error: 'Playlist not found or access denied' }, { status: 404 })
      }
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (playlist_id !== undefined) updateData.playlist_id = playlist_id
    if (screen_id !== undefined) updateData.screen_id = screen_id
    if (target_screen_types !== undefined) updateData.target_screen_types = target_screen_types
    if (target_locations !== undefined) updateData.target_locations = target_locations
    if (start_date !== undefined) updateData.start_date = start_date
    if (end_date !== undefined) updateData.end_date = end_date
    if (start_time !== undefined) updateData.start_time = start_time
    if (end_time !== undefined) updateData.end_time = end_time
    if (days_of_week !== undefined) updateData.days_of_week = days_of_week
    if (timezone !== undefined) updateData.timezone = timezone
    if (priority !== undefined) updateData.priority = priority
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: schedule, error: updateError } = await supabase
      .from('schedules')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        playlists (
          id,
          name,
          total_duration,
          loop_mode
        ),
        screens (
          id,
          name,
          location_id,
          locations (
            id,
            name,
            district_id,
            districts (
              id,
              name
            )
          )
        )
      `)
      .single()

    if (updateError) {
      console.error('Error updating schedule:', updateError)
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
    }

    // Update screen assignments if provided
    if (screen_ids.length > 0) {
      // Remove existing screen assignments
      await supabase
        .from('screen_schedules')
        .delete()
        .eq('schedule_id', params.id)

      // Add new screen assignments
      const screenSchedules = screen_ids.map((screenId: string) => ({
        schedule_id: params.id,
        screen_id: screenId
      }))

      const { error: screenSchedulesError } = await supabase
        .from('screen_schedules')
        .insert(screenSchedules)

      if (screenSchedulesError) {
        console.error('Error updating screen schedules:', screenSchedulesError)
        return NextResponse.json({ error: 'Failed to update screen assignments' }, { status: 500 })
      }
    }

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error in schedule PUT:', error)
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

    // Check if schedule exists and user has permission
    const { data: existingSchedule, error: fetchError } = await supabase
      .from('schedules')
      .select('id, created_by, organization_id')
      .eq('id', params.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
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
    const canDelete = existingSchedule.created_by === user.id || 
                     profile.role === 'super_admin'

    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('schedules')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('Error deleting schedule:', deleteError)
      return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Schedule deleted successfully' })
  } catch (error) {
    console.error('Error in schedule DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}