import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    const lastSync = searchParams.get('since')

    if (!deviceToken) {
      return NextResponse.json({ 
        error: 'Device token required' 
      }, { status: 401 })
    }

    console.log('Pi device sync request:', { deviceToken: deviceToken?.substring(0, 10) + '...', lastSync })

    // Use service role client for device operations
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    )

    // Find screen by device token
    const { data: screen, error: screenError } = await adminSupabase
      .from('screens')
      .select(`
        id,
        name,
        screen_type,
        device_id,
        last_sync_at,
        sync_version,
        locations (
          id,
          name,
          timezone
        )
      `)
      .eq('device_token', deviceToken)
      .single()

    if (screenError || !screen) {
      console.error('Screen not found for device token:', screenError)
      return NextResponse.json({ 
        error: 'Invalid device token' 
      }, { status: 401 })
    }

    // Update last seen and sync timestamp
    await adminSupabase
      .from('screens')
      .update({
        last_seen: new Date().toISOString(),
        last_sync_at: new Date().toISOString()
      })
      .eq('id', screen.id)

    // Get current time in location timezone
    const now = new Date()
    const currentDate = now.toISOString().split('T')[0]
    const currentTime = now.toTimeString().slice(0, 8)
    const currentDay = now.getDay() || 7 // Convert Sunday from 0 to 7

    // Get active schedules for this screen - simplified query first
    console.log('Fetching schedules for screen:', screen.id)
    const { data: schedules, error: schedulesError } = await adminSupabase
      .from('schedules')
      .select(`
        id,
        name,
        start_date,
        end_date,
        start_time,
        end_time,
        days_of_week,
        priority,
        updated_at,
        playlist_id
      `)
      .eq('screen_id', screen.id)
      .eq('is_active', true)
      .lte('start_date', currentDate)
      .or(`end_date.is.null,end_date.gte.${currentDate}`)
      .order('priority', { ascending: false })

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError)
      console.error('Screen ID:', screen.id)
      console.error('Current date:', currentDate)
      return NextResponse.json({ 
        error: 'Failed to fetch schedules',
        details: schedulesError.message 
      }, { status: 500 })
    }

    console.log('Found schedules:', schedules?.length || 0)

    // Get playlist details separately to avoid complex nested query issues
    const enrichedSchedules = []
    if (schedules && schedules.length > 0) {
      for (const schedule of schedules) {
        let playlist = null
        if (schedule.playlist_id) {
          const { data: playlistData, error: playlistError } = await adminSupabase
            .from('playlists')
            .select(`
              id,
              name,
              updated_at
            `)
            .eq('id', schedule.playlist_id)
            .single()

          if (!playlistError && playlistData) {
            // Get playlist items
            const { data: items, error: itemsError } = await adminSupabase
              .from('playlist_items')
              .select(`
                id,
                display_order,
                display_duration,
                media_asset_id
              `)
              .eq('playlist_id', playlistData.id)
              .order('display_order')

            if (!itemsError && items) {
              // Get media assets for each item
              const enrichedItems = []
              for (const item of items) {
                const { data: mediaAsset, error: mediaError } = await adminSupabase
                  .from('media_assets')
                  .select(`
                    id,
                    name,
                    file_url,
                    thumbnail_url,
                    preview_url,
                    optimized_url,
                    mime_type,
                    file_size,
                    duration,
                    width,
                    height,
                    updated_at
                  `)
                  .eq('id', item.media_asset_id)
                  .single()

                enrichedItems.push({
                  ...item,
                  media_assets: mediaError ? null : mediaAsset
                })
              }
              
              playlist = {
                ...playlistData,
                playlist_items: enrichedItems
              }
            }
          }
        }
        
        enrichedSchedules.push({
          ...schedule,
          playlists: playlist
        })
      }
    }

    // Filter schedules by current day and time
    const activeSchedules = enrichedSchedules.filter(schedule => {
      const isToday = schedule.days_of_week.includes(currentDay)
      const isInTimeRange = currentTime >= schedule.start_time && currentTime <= schedule.end_time
      return isToday && isInTimeRange
    })

    // Find the highest priority active schedule
    const currentSchedule = activeSchedules.length > 0 ? activeSchedules[0] : null

    // Check what has changed since last sync
    let scheduleChanged = false
    let mediaChanged = false

    if (lastSync) {
      const lastSyncDate = new Date(lastSync)
      
      // Check if any schedule was updated since last sync
      scheduleChanged = enrichedSchedules.some(schedule => 
        new Date(schedule.updated_at) > lastSyncDate ||
        (schedule.playlists && new Date(schedule.playlists.updated_at) > lastSyncDate)
      )

      // Check if any media was updated since last sync
      mediaChanged = enrichedSchedules.some(schedule => 
        schedule.playlists?.playlist_items.some(item =>
          item.media_assets && new Date(item.media_assets.updated_at) > lastSyncDate
        )
      )
    } else {
      // First sync, everything is new
      scheduleChanged = true
      mediaChanged = true
    }

    // Build response with optimized URLs
    const syncData = {
      device_id: screen.device_id,
      screen_id: screen.id,
      screen_name: screen.name,
      screen_type: screen.screen_type,
      location: screen.locations,
      sync_timestamp: new Date().toISOString(),
      schedule_changed: scheduleChanged,
      media_changed: mediaChanged,
      current_schedule: currentSchedule ? {
        id: currentSchedule.id,
        name: currentSchedule.name,
        playlist_id: currentSchedule.playlists?.id,
        playlist_name: currentSchedule.playlists?.name,
        priority: currentSchedule.priority,
        start_time: currentSchedule.start_time,
        end_time: currentSchedule.end_time,
        days_of_week: currentSchedule.days_of_week
      } : null,
      all_schedules: enrichedSchedules.map(schedule => ({
        id: schedule.id,
        name: schedule.name,
        start_date: schedule.start_date,
        end_date: schedule.end_date,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        days_of_week: schedule.days_of_week,
        priority: schedule.priority,
        playlist: schedule.playlists ? {
          id: schedule.playlists.id,
          name: schedule.playlists.name,
          items: schedule.playlists.playlist_items
            .sort((a, b) => a.display_order - b.display_order)
            .map(item => ({
              id: item.id,
              display_order: item.display_order,
              display_duration: item.display_duration,
              media: item.media_assets ? {
                id: item.media_assets.id,
                name: item.media_assets.name,
                // Use optimized URLs in order of preference
                url: item.media_assets.optimized_url || 
                     item.media_assets.preview_url || 
                     item.media_assets.file_url,
                thumbnail_url: item.media_assets.thumbnail_url,
                mime_type: item.media_assets.mime_type,
                file_size: item.media_assets.file_size,
                duration: item.media_assets.duration,
                width: item.media_assets.width,
                height: item.media_assets.height
              } : null
            }))
        } : null
      })),
      next_sync_recommended: 120 // seconds
    }

    // Log sync activity
    await adminSupabase
      .from('device_sync_log')
      .insert({
        screen_id: screen.id,
        sync_type: 'schedule',
        sync_data: {
          schedule_changed: scheduleChanged,
          media_changed: mediaChanged,
          active_schedules_count: activeSchedules.length,
          current_schedule_id: currentSchedule?.id
        },
        success: true
      })

    console.log('Sync successful for device:', screen.device_id, 'Current schedule:', currentSchedule?.name || 'None')

    return NextResponse.json(syncData, { status: 200 })

  } catch (error) {
    console.error('Device sync error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow CORS for Pi devices
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}