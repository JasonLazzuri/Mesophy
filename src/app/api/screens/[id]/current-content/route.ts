import { createClient } from '@/lib/supabase/server'
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
    const supabase = await createClient()
    const { id: screen_id } = params
    
    console.log(`🔍 Checking content for screen: ${screen_id}`)
    console.log(`📍 API endpoint is working!`)

    // 1. Verify the screen exists
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('*')
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      console.log(`❌ Screen not found: ${screen_id}`)
      return NextResponse.json(
        { error: 'Screen not found' }, 
        { status: 404 }
      )
    }

    console.log(`✅ Screen found: ${screen.name} (${screen.screen_type})`)

    // 2. Get current time in the screen's timezone
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' }) // monday, tuesday, etc.

    console.log(`🕐 Current time: ${currentTime}, day: ${currentDay}`)

    // 3. Find active schedules for this screen
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select(`
        id,
        name,
        start_time,
        end_time,
        days_of_week,
        start_date,
        end_date,
        is_active,
        playlist_id,
        playlists:playlist_id (
          id,
          name,
          media_assets (
            id,
            filename,
            file_type,
            file_url,
            duration,
            file_size
          )
        )
      `)
      .or(`screen_ids.cs.{${screen_id}},screen_types.cs.{${screen.screen_type}}`)
      .eq('is_active', true)
      .lte('start_date', now.toISOString().split('T')[0])
      .gte('end_date', now.toISOString().split('T')[0])

    if (schedulesError) {
      console.error('❌ Error fetching schedules:', schedulesError)
      return NextResponse.json(
        { error: 'Failed to fetch schedules' }, 
        { status: 500 }
      )
    }

    console.log(`📅 Found ${schedules?.length || 0} potential schedules`)

    // 4. Filter schedules by current time and day
    const activeSchedules = schedules?.filter(schedule => {
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

    // 7. Return the content
    const response = {
      schedule_id: activeSchedule.id,
      schedule_name: activeSchedule.name,
      screen_id,
      screen_name: screen.name,
      playlist: activeSchedule.playlists,
      media_assets: activeSchedule.playlists?.media_assets || [],
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