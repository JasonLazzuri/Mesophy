import { createClient } from '@supabase/supabase-js'

/**
 * Notification utilities for triggering real-time updates to devices
 * 
 * These functions can be called from API endpoints to immediately notify
 * devices when content changes, eliminating the need for polling.
 */

// Get Supabase admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                    process.env.SUPABASE_SERVICE_ROLE_KEY ||
                    process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase configuration missing for notifications')
  }

  return createClient(supabaseUrl, serviceKey)
}

/**
 * Notify devices when a schedule changes
 */
export async function notifyScheduleChange(
  scheduleId: string,
  scheduleName: string,
  screenId: string | null = null,
  action: 'created' | 'updated' | 'deleted' = 'updated'
) {
  try {
    const supabase = getSupabaseAdmin()
    
    const notification = {
      screen_id: screenId,
      notification_type: 'schedule_change',
      title: `Schedule ${action}: ${scheduleName}`,
      message: `Schedule has been ${action} - content may have changed`,
      schedule_id: scheduleId,
      payload: {
        action,
        schedule_name: scheduleName
      },
      priority: 2
    }

    const { error } = await supabase
      .from('device_notifications')
      .insert(notification)

    if (error) {
      console.error('Failed to create schedule notification:', error)
    } else {
      console.log(`✅ Schedule notification sent: ${action} - ${scheduleName}`)
    }
  } catch (error) {
    console.error('Error sending schedule notification:', error)
  }
}

/**
 * Notify devices when a playlist changes
 */
export async function notifyPlaylistChange(
  playlistId: string,
  playlistName: string,
  action: 'created' | 'updated' | 'deleted' = 'updated',
  affectedScreenIds: string[] = []
) {
  try {
    const supabase = getSupabaseAdmin()

    // If no specific screens provided, find all screens using this playlist
    let screenIds = affectedScreenIds
    if (screenIds.length === 0) {
      const { data: schedules } = await supabase
        .from('schedules')
        .select('screen_id')
        .eq('playlist_id', playlistId)
        .eq('is_active', true)

      screenIds = [...new Set(schedules?.map(s => s.screen_id) || [])]
    }

    // Create notification for each affected screen
    const notifications = screenIds.map(screenId => ({
      screen_id: screenId,
      notification_type: 'playlist_change',
      title: `Playlist ${action}: ${playlistName}`,
      message: `Playlist content has been ${action}`,
      playlist_id: playlistId,
      payload: {
        action,
        playlist_name: playlistName
      },
      priority: 3 // Higher priority for playlist changes
    }))

    if (notifications.length > 0) {
      const { error } = await supabase
        .from('device_notifications')
        .insert(notifications)

      if (error) {
        console.error('Failed to create playlist notifications:', error)
      } else {
        console.log(`✅ Playlist notifications sent to ${notifications.length} screens: ${action} - ${playlistName}`)
      }
    }
  } catch (error) {
    console.error('Error sending playlist notifications:', error)
  }
}

/**
 * Notify devices when playlist items change (duration, order, etc.)
 */
export async function notifyPlaylistItemsChange(
  playlistId: string,
  playlistName: string,
  action: 'item_added' | 'item_updated' | 'item_removed' | 'items_reordered' = 'item_updated'
) {
  try {
    const supabase = getSupabaseAdmin()

    // Find all screens using this playlist
    const { data: schedules } = await supabase
      .from('schedules')
      .select('screen_id')
      .eq('playlist_id', playlistId)
      .eq('is_active', true)

    const screenIds = [...new Set(schedules?.map(s => s.screen_id) || [])]

    // Create high-priority notifications for playlist content changes
    const notifications = screenIds.map(screenId => ({
      screen_id: screenId,
      notification_type: 'playlist_change',
      title: `Media ${action.replace('_', ' ')}: ${playlistName}`,
      message: 'Playlist content changed - display durations may be updated',
      playlist_id: playlistId,
      payload: {
        action,
        playlist_name: playlistName
      },
      priority: 3 // Very high priority for content changes
    }))

    if (notifications.length > 0) {
      const { error } = await supabase
        .from('device_notifications')
        .insert(notifications)

      if (error) {
        console.error('Failed to create playlist item notifications:', error)
      } else {
        console.log(`✅ Playlist item notifications sent to ${notifications.length} screens: ${action} - ${playlistName}`)
      }
    }
  } catch (error) {
    console.error('Error sending playlist item notifications:', error)
  }
}

/**
 * Notify devices when media assets change
 */
export async function notifyMediaAssetChange(
  mediaAssetId: string,
  mediaAssetName: string,
  action: 'updated' | 'deleted' = 'updated'
) {
  try {
    const supabase = getSupabaseAdmin()

    // Find all screens that use this media asset
    const { data: schedules } = await supabase
      .from('schedules')
      .select(`
        screen_id,
        playlists!inner (
          playlist_items!inner (
            media_asset_id
          )
        )
      `)
      .eq('playlists.playlist_items.media_asset_id', mediaAssetId)
      .eq('is_active', true)

    const screenIds = [...new Set(schedules?.map(s => s.screen_id) || [])]

    // Create notifications for each affected screen
    const notifications = screenIds.map(screenId => ({
      screen_id: screenId,
      notification_type: 'media_change',
      title: `Media ${action}: ${mediaAssetName}`,
      message: `Media asset ${action} - may need to re-download`,
      media_asset_id: mediaAssetId,
      payload: {
        action,
        media_name: mediaAssetName
      },
      priority: 1 // Normal priority for media changes
    }))

    if (notifications.length > 0) {
      const { error } = await supabase
        .from('device_notifications')
        .insert(notifications)

      if (error) {
        console.error('Failed to create media asset notifications:', error)
      } else {
        console.log(`✅ Media asset notifications sent to ${notifications.length} screens: ${action} - ${mediaAssetName}`)
      }
    }
  } catch (error) {
    console.error('Error sending media asset notifications:', error)
  }
}

/**
 * Send a test notification to a specific screen
 */
export async function sendTestNotification(screenId: string, message: string = 'Test notification') {
  try {
    const supabase = getSupabaseAdmin()

    const notification = {
      screen_id: screenId,
      notification_type: 'system_message',
      title: 'Test Notification',
      message: message,
      payload: {
        action: 'test',
        timestamp: new Date().toISOString()
      },
      priority: 1
    }

    const { error } = await supabase
      .from('device_notifications')
      .insert(notification)

    if (error) {
      console.error('Failed to send test notification:', error)
      return false
    } else {
      console.log(`✅ Test notification sent to screen: ${screenId}`)
      return true
    }
  } catch (error) {
    console.error('Error sending test notification:', error)
    return false
  }
}