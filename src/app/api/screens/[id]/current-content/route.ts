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
    console.log('GET /api/screens/[id]/current-content - Starting request for ID:', params.id)
    
    // Get environment variables (exact same pattern as working endpoint)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('GET /api/screens/[id]/current-content - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const screen_id = params.id
    console.log(`🔍 Checking content for screen: ${screen_id}`)

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

    // 2. Get current time in the screen's timezone (PDT/PST for Pi devices)
    const now = new Date()
    // Convert to PDT timezone for Pi devices
    const pdtTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))
    const currentTime = pdtTime.toTimeString().slice(0, 5) // HH:MM format
    const currentDay = pdtTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() // monday, tuesday, etc.

    console.log(`🕐 Current time: ${currentTime}, day: ${currentDay}`)

    // 3. Find active schedules for this screen
    const todayDate = pdtTime.toISOString().split('T')[0]
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
      const screenIdMatch = schedule.screen_id === screen_id
      const screenTypeMatch = schedule.target_screen_types && schedule.target_screen_types.includes(screen.screen_type)
      // If no specific screen assignments, assume "All screens"
      const allScreensMatch = !schedule.screen_id && (!schedule.target_screen_types || schedule.target_screen_types.length === 0)
      const matches = screenIdMatch || screenTypeMatch || allScreensMatch
      console.log(`🔍 Schedule "${schedule.name}": screen_id=${schedule.screen_id}, target_screen_types=${JSON.stringify(schedule.target_screen_types)}, screen_type=${screen.screen_type}, matches=${matches}`)
      return matches
    })

    console.log(`📅 Found ${screenSchedules?.length || 0} potential schedules for this screen`)

    // 4. Filter schedules by current time and day
    const activeSchedules = screenSchedules?.filter(schedule => {
      // Check if today is in the days_of_week array (0=Sunday, 6=Saturday)
      const currentDayNum = pdtTime.getDay() // 0=Sunday, 6=Saturday
      const daysMatch = schedule.days_of_week?.includes(currentDayNum)
      
      // Check if current time is within schedule time range
      const timeInRange = currentTime >= schedule.start_time && currentTime <= schedule.end_time
      
      console.log(`📋 Schedule "${schedule.name}": currentDay=${currentDay}(${currentDayNum}), daysOfWeek=${JSON.stringify(schedule.days_of_week)}, daysMatch=${daysMatch}, currentTime=${currentTime}, timeRange=${schedule.start_time}-${schedule.end_time}, timeInRange=${timeInRange}`)
      
      return daysMatch && timeInRange
    }) || []

    console.log(`🎯 Found ${activeSchedules.length} active schedules`)

    // 5. If no active schedules, return empty response with required fields
    if (activeSchedules.length === 0) {
      console.log('📭 No content scheduled for current time')
      return NextResponse.json({
        schedule_id: null,
        schedule_name: null,
        screen_id,
        screen_name: screen.name,
        playlist: null,
        media_assets: [],
        current_time: currentTime,
        current_day: currentDay,
        schedule_time_range: null,
        message: 'No content scheduled for current time'
      })
    }

    // 6. Get the first active schedule (you could implement priority logic here)
    const activeSchedule = activeSchedules[0]
    
    console.log(`🎬 Using schedule: "${activeSchedule.name}" with playlist: "${activeSchedule.playlists?.name}"`)

    // 7. Get media assets for the playlist via playlist_items junction table
    let mediaAssets = []
    if (activeSchedule.playlist_id) {
      // Step 1: Get playlist_items for this playlist
      const playlistItemsResponse = await fetch(`${url}/rest/v1/playlist_items?playlist_id=eq.${activeSchedule.playlist_id}&select=duration_override,order_index,media_asset_id&order=order_index`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (playlistItemsResponse.ok) {
        const playlistItems = await playlistItemsResponse.json()
        console.log(`🔍 Found ${playlistItems.length} playlist items:`, JSON.stringify(playlistItems, null, 2))
        
        if (playlistItems.length > 0) {
          // Step 2: Get the actual media assets for these items
          const mediaAssetIds = playlistItems.map(item => item.media_asset_id).filter(Boolean)
          console.log(`📋 Media asset IDs to fetch:`, mediaAssetIds)
          
          if (mediaAssetIds.length > 0) {
            const mediaAssetsResponse = await fetch(`${url}/rest/v1/media_assets?id=in.(${mediaAssetIds.join(',')})&select=*`, {
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (mediaAssetsResponse.ok) {
              const fetchedAssets = await mediaAssetsResponse.json()
              console.log(`🎵 Fetched ${fetchedAssets.length} media assets`)
              
              // Combine with playlist item data (duration, order)
              mediaAssets = playlistItems.map(playlistItem => {
                const asset = fetchedAssets.find(a => a.id === playlistItem.media_asset_id)
                if (asset) {
                  return {
                    ...asset,
                    display_duration: playlistItem.duration_override || asset.duration || 10, // Use override or default
                    display_order: playlistItem.order_index
                  }
                }
                return null
              }).filter(Boolean)
              
              console.log(`✅ Successfully mapped ${mediaAssets.length} playlist media assets`)
            } else {
              console.error(`❌ Failed to fetch media assets: ${mediaAssetsResponse.status}`)
              mediaAssets = []
            }
          }
        } else {
          console.log(`📭 No playlist items found for playlist ${activeSchedule.playlist_id}`)
          mediaAssets = []
        }
      } else {
        console.error(`❌ Failed to fetch playlist items: ${playlistItemsResponse.status} - ${playlistItemsResponse.statusText}`)
        const errorText = await playlistItemsResponse.text()
        console.error(`Error details: ${errorText}`)
        mediaAssets = []
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
      { 
        error: 'Internal server error',
        debug: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      }, 
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