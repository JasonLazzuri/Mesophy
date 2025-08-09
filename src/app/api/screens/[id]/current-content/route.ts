import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/screens/[id]/current-content
 * 
 * Returns the current scheduled content for a specific screen
 * Used by Pi devices to fetch content that should be playing now
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: screen_id } = params
    
    console.log(`🔍 Checking content for screen: ${screen_id}`)
    console.log(`📍 API endpoint is working!`)

    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // 1. Verify the screen exists
    const screenResponse = await fetch(`${url}/rest/v1/screens?id=eq.${screen_id}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!screenResponse.ok) {
      console.error('Screen fetch failed:', screenResponse.status, screenResponse.statusText)
      return NextResponse.json({ error: 'Failed to fetch screen' }, { status: 500 })
    }

    const screens = await screenResponse.json()
    if (!screens || screens.length === 0) {
      console.log(`❌ Screen not found: ${screen_id}`)
      return NextResponse.json(
        { error: 'Screen not found' }, 
        { status: 404 }
      )
    }

    const screen = screens[0]

    console.log(`✅ Screen found: ${screen.name} (${screen.screen_type})`)

    // 2. Get current time in the screen's timezone
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' }) // monday, tuesday, etc.

    console.log(`🕐 Current time: ${currentTime}, day: ${currentDay}`)

    // 3. Find active schedules for this screen
    const todayDate = now.toISOString().split('T')[0]
    const schedulesResponse = await fetch(`${url}/rest/v1/schedules?is_active=eq.true&start_date=lte.${todayDate}&end_date=gte.${todayDate}&select=*,playlists(*)`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!schedulesResponse.ok) {
      console.error('❌ Error fetching schedules:', schedulesResponse.status, schedulesResponse.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch schedules' }, 
        { status: 500 }
      )
    }

    const allSchedules = await schedulesResponse.json()

    // Filter schedules that match this screen (by screen_id or screen_type)
    const screenSchedules = allSchedules.filter(schedule => {
      const screenIdMatch = schedule.screen_ids && schedule.screen_ids.includes(screen_id)
      const screenTypeMatch = schedule.screen_types && schedule.screen_types.includes(screen.screen_type)
      return screenIdMatch || screenTypeMatch
    })

    console.log(`📅 Found ${screenSchedules?.length || 0} potential schedules for this screen`)

    // 4. Filter schedules by current time and day
    const activeSchedules = screenSchedules?.filter(schedule => {
      // Check if today is in the days_of_week array
      const daysMatch = schedule.days_of_week?.includes(currentDay)
      
      // Check if current time is within schedule time range
      const timeInRange = currentTime >= schedule.start_time && currentTime <= schedule.end_time
      
      console.log(`📋 Schedule "${schedule.name}": days=${daysMatch}, time=${timeInRange} (${schedule.start_time}-${schedule.end_time})`)
      
      return daysMatch && timeInRange
    }) || []

    console.log(`🎯 Found ${activeSchedules.length} active schedules`)

    // 5. If no active schedules, return empty response
    if (activeSchedules.length === 0) {
      console.log('📭 No content scheduled for current time')
      return NextResponse.json({
        message: 'No content scheduled for current time',
        screen_id,
        current_time: currentTime,
        current_day: currentDay
      })
    }

    // 6. Get the first active schedule (you could implement priority logic here)
    const activeSchedule = activeSchedules[0]
    
    console.log(`🎬 Using schedule: "${activeSchedule.name}" with playlist: "${activeSchedule.playlists?.name}"`)

    // 7. Get media assets for the playlist
    let mediaAssets = []
    if (activeSchedule.playlist_id) {
      const mediaResponse = await fetch(`${url}/rest/v1/media_assets?playlist_id=eq.${activeSchedule.playlist_id}&select=*&order=order_index`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (mediaResponse.ok) {
        mediaAssets = await mediaResponse.json()
        console.log(`🎵 Found ${mediaAssets.length} media assets in playlist`)
      } else {
        console.warn(`⚠️ Failed to fetch media assets: ${mediaResponse.status}`)
      }
    }

    // 8. Return the content
    const response = {
      schedule_id: activeSchedule.id,
      schedule_name: activeSchedule.name,
      screen_id,
      screen_name: screen.name,
      playlist: activeSchedule.playlists,
      media_assets: mediaAssets,
      current_time: currentTime,
      current_day: currentDay,
      schedule_time_range: `${activeSchedule.start_time}-${activeSchedule.end_time}`
    }

    console.log(`✅ Returning content with ${response.media_assets.length} media assets`)

    return NextResponse.json(response)

  } catch (error) {
    console.error('💥 Error fetching current content:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  )
}