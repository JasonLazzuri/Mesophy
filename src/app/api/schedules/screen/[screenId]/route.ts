import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: {
    screenId: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const datetime = searchParams.get('datetime')
    const active_only = searchParams.get('active_only') === 'true'

    // Verify screen exists and user has access
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        location_id,
        locations!inner (
          id,
          name,
          district_id,
          districts!inner (
            id,
            name,
            organization_id
          )
        )
      `)
      .eq('id', params.screenId)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Get user profile for access check
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check access permissions
    if (screen.locations.districts.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (profile.role === 'district_manager' && screen.locations.district_id !== profile.district_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (profile.role === 'location_manager' && screen.location_id !== profile.location_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // If specific datetime is provided, get active schedules for that time
    if (datetime) {
      const { data: activeSchedules, error: activeError } = await supabase
        .rpc('get_active_schedules_for_screen', {
          p_screen_id: params.screenId,
          p_datetime: datetime
        })

      if (activeError) {
        console.error('Error getting active schedules:', activeError)
        return NextResponse.json({ error: 'Failed to get active schedules' }, { status: 500 })
      }

      return NextResponse.json({ 
        screen,
        active_schedules: activeSchedules,
        datetime 
      })
    }

    // Get all schedules for this screen
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
        )
      `)
      .or(`screen_id.eq.${params.screenId},screen_id.is.null`)
      .eq('organization_id', profile.organization_id)

    // Also include schedules assigned via screen_schedules junction table
    const { data: screenScheduleIds } = await supabase
      .from('screen_schedules')
      .select('schedule_id')
      .eq('screen_id', params.screenId)

    if (screenScheduleIds && screenScheduleIds.length > 0) {
      const scheduleIds = screenScheduleIds.map(s => s.schedule_id)
      query = query.or(`id.in.(${scheduleIds.join(',')})`)
    }

    if (active_only) {
      query = query.eq('is_active', true)
    }

    query = query.order('priority', { ascending: false })
      .order('start_time', { ascending: true })

    const { data: schedules, error } = await query

    if (error) {
      console.error('Error fetching screen schedules:', error)
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    // Sort playlist items by order_index for each schedule
    schedules?.forEach(schedule => {
      if (schedule.playlists?.playlist_items) {
        schedule.playlists.playlist_items.sort((a: any, b: any) => a.order_index - b.order_index)
      }
    })

    return NextResponse.json({ 
      screen,
      schedules: schedules || []
    })
  } catch (error) {
    console.error('Error in screen schedules GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}