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
      .select('organization_id, role, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const screenId = searchParams.get('screen_id')
    const includeScreens = searchParams.get('include_screens') === 'true'

    // Build base query with role-based filtering
    let query = supabase
      .from('schedules')
      .select(`
        id,
        organization_id,
        name,
        playlist_id,
        screen_id,
        start_date,
        end_date,
        start_time,
        end_time,
        days_of_week,
        timezone,
        priority,
        is_active,
        created_by,
        created_at,
        updated_at,
        playlists (
          id,
          name,
          total_duration,
          loop_mode
        )
        ${includeScreens ? `, screens (
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
        )` : ''}
      `)
      .eq('organization_id', profile.organization_id)

    // Apply role-based filtering
    if (profile.role === 'district_manager' && profile.district_id) {
      // District managers can only see schedules for screens in their district
      query = query.or(`screen_id.is.null,screens.locations.district_id.eq.${profile.district_id}`)
    } else if (profile.role === 'location_manager' && profile.location_id) {
      // Location managers can only see schedules for screens in their location
      query = query.or(`screen_id.is.null,screens.location_id.eq.${profile.location_id}`)
    }

    // Filter by specific screen if requested
    if (screenId) {
      query = query.or(`screen_id.eq.${screenId},screen_schedules.screen_id.eq.${screenId}`)
    }

    query = query.order('created_at', { ascending: false })

    const { data: schedules, error } = await query

    if (error) {
      console.error('Error fetching schedules:', error)
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    return NextResponse.json({ schedules })
  } catch (error) {
    console.error('Error in schedules GET:', error)
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
      .select('organization_id, role, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { 
      name, 
      playlist_id, 
      screen_id = null, 
      screen_ids = [], 
      target_screen_types = null,
      target_locations = null,
      start_date, 
      end_date = null, 
      start_time, 
      end_time, 
      days_of_week = [0,1,2,3,4,5,6], 
      timezone = 'UTC', 
      priority = 1 
    } = body

    // Validate required fields
    if (!name || !playlist_id || !start_date || !start_time || !end_time) {
      return NextResponse.json({ 
        error: 'Name, playlist, start date, start time, and end time are required' 
      }, { status: 400 })
    }

    // Validate that playlist exists and belongs to organization
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('id, organization_id')
      .eq('id', playlist_id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (playlistError || !playlist) {
      return NextResponse.json({ error: 'Playlist not found or access denied' }, { status: 404 })
    }

    // If specific screen is provided, validate access
    if (screen_id) {
      const { data: screen } = await supabase
        .from('screens')
        .select(`
          id, 
          location_id,
          locations!inner (
            id,
            district_id,
            districts!inner (
              id,
              organization_id
            )
          )
        `)
        .eq('id', screen_id)
        .single()

      if (!screen || screen.locations.districts.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Screen not found or access denied' }, { status: 404 })
      }

      // Check role-based access to screen
      if (profile.role === 'district_manager' && screen.locations.district_id !== profile.district_id) {
        return NextResponse.json({ error: 'Access denied to this screen' }, { status: 403 })
      }
      if (profile.role === 'location_manager' && screen.location_id !== profile.location_id) {
        return NextResponse.json({ error: 'Access denied to this screen' }, { status: 403 })
      }
    }

    // Create the schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .insert({
        organization_id: profile.organization_id,
        name: name.trim(),
        playlist_id,
        screen_id,
        target_screen_types,
        target_locations,
        start_date,
        end_date,
        start_time,
        end_time,
        days_of_week,
        timezone,
        priority,
        created_by: user.id,
        is_active: true
      })
      .select(`
        *,
        playlists (
          id,
          name,
          total_duration,
          loop_mode
        )
      `)
      .single()

    if (scheduleError) {
      console.error('Error creating schedule:', scheduleError)
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 })
    }

    // If multiple screens are specified, create screen_schedules entries
    if (screen_ids.length > 0) {
      const screenSchedules = screen_ids.map((screenId: string) => ({
        schedule_id: schedule.id,
        screen_id: screenId
      }))

      const { error: screenSchedulesError } = await supabase
        .from('screen_schedules')
        .insert(screenSchedules)

      if (screenSchedulesError) {
        console.error('Error creating screen schedules:', screenSchedulesError)
        // Clean up schedule if screen assignments failed
        await supabase.from('schedules').delete().eq('id', schedule.id)
        return NextResponse.json({ error: 'Failed to assign schedule to screens' }, { status: 500 })
      }
    }

    return NextResponse.json({ schedule }, { status: 201 })
  } catch (error) {
    console.error('Error in schedules POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}