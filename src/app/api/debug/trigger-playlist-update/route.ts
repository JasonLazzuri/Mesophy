import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/debug/trigger-playlist-update
 * 
 * Manually trigger a playlist update notification for debugging
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    const androidTVScreenId = '003a361b-681d-4299-8337-bd7e5c09d1ed'

    console.log('Debug: Triggering playlist update for Android TV:', androidTVScreenId)

    // Step 1: Check if schedules are linked
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, name, screen_id, playlist_id, playlists(name)')
      .eq('is_active', true)

    console.log('Debug: Active schedules found:', schedules?.length || 0)
    console.log('Debug: Schedules linked to Android TV:', schedules?.filter(s => s.screen_id === androidTVScreenId).length || 0)

    // Step 2: Create manual notification
    const { data: notification, error: notificationError } = await supabase
      .from('device_notifications')
      .insert({
        screen_id: androidTVScreenId,
        notification_type: 'playlist_change',
        title: 'Debug: Playlist Update Test',
        message: 'Testing playlist update notifications from API endpoint',
        priority: 3,
        payload: {
          action: 'debug_test',
          timestamp: new Date().toISOString(),
          source: 'debug_api'
        }
      })
      .select()
      .single()

    if (notificationError) {
      console.error('Debug: Failed to create notification:', notificationError)
      return NextResponse.json({ 
        error: 'Failed to create notification',
        details: notificationError.message 
      }, { status: 500 })
    }

    console.log('Debug: Notification created:', notification.id)

    // Step 3: Try to simulate playlist update trigger
    if (schedules && schedules.length > 0) {
      const firstSchedule = schedules[0]
      if (firstSchedule.playlist_id) {
        console.log('Debug: Updating playlist to trigger automatic notification:', firstSchedule.playlist_id)
        
        const { error: updateError } = await supabase
          .from('playlists')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', firstSchedule.playlist_id)

        if (updateError) {
          console.error('Debug: Failed to update playlist:', updateError)
        } else {
          console.log('Debug: Playlist updated successfully')
        }
      }
    }

    // Step 4: Check recent notifications
    const { data: recentNotifications } = await supabase
      .from('device_notifications')
      .select('*')
      .eq('screen_id', androidTVScreenId)
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      success: true,
      message: 'Debug test completed - check Android TV logs',
      debug_info: {
        android_tv_screen_id: androidTVScreenId,
        active_schedules: schedules?.length || 0,
        schedules_linked_to_android_tv: schedules?.filter(s => s.screen_id === androidTVScreenId).length || 0,
        manual_notification_created: !!notification,
        recent_notifications: recentNotifications?.length || 0
      },
      schedules: schedules?.map(s => ({
        name: s.name,
        playlist_name: s.playlists?.name,
        screen_id: s.screen_id,
        linked_to_android_tv: s.screen_id === androidTVScreenId
      })),
      instructions: [
        '1. Check Android TV logs for new SSE events',
        '2. Look for content_update or playlist_change events', 
        '3. If no events appear, the SSE delivery may be broken',
        '4. If events appear but playlist doesnt update, the Android client may have issues'
      ]
    })

  } catch (error) {
    console.error('Debug trigger error:', error)
    return NextResponse.json({ 
      error: 'Debug test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}