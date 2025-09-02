// Fixed SSE polling function - addresses the "first notification works, then stops" issue

const checkForNotifications = async () => {
  try {
    // Get all undelivered notifications
    const { data: notifications, error } = await supabase
      .from('device_notifications')
      .select('*')
      .eq('screen_id', screenId)
      .is('delivered_at', null)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('SSE: Error fetching notifications:', error)
      return
    }
    
    if (notifications && notifications.length > 0) {
      console.log(`SSE: Found ${notifications.length} new notifications for screen:`, screenId)
      
      // Collect notification IDs to mark as delivered
      const notificationIds = []
      
      for (const notification of notifications) {
        try {
          // Send content update notification via SSE
          controller.enqueue(encoder.encode('event: content_update\n'))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            id: notification.id,
            type: notification.notification_type,
            title: notification.title,
            message: notification.message,
            scheduleId: notification.schedule_id,
            playlistId: notification.playlist_id,
            mediaAssetId: notification.media_asset_id,
            priority: notification.priority,
            timestamp: notification.created_at
          })}\n\n`))
          
          console.log('SSE: Content update sent for screen:', screenId, '- title:', notification.title)
          
          // Add to batch for marking as delivered
          notificationIds.push(notification.id)
          
        } catch (error) {
          console.error('SSE: Error delivering notification:', error)
          // Don't break the loop, continue with other notifications
        }
      }
      
      // Batch update all delivered notifications (avoid await in loop)
      if (notificationIds.length > 0) {
        supabase
          .from('device_notifications')
          .update({ delivered_at: new Date().toISOString() })
          .in('id', notificationIds)
          .then(({ error }) => {
            if (error) {
              console.error('SSE: Error marking notifications as delivered:', error)
            } else {
              console.log(`SSE: Marked ${notificationIds.length} notifications as delivered`)
            }
          })
          .catch((error) => {
            console.error('SSE: Error in batch update:', error)
          })
      }
      
      lastCheckedTime = new Date()
    }
  } catch (error) {
    console.error('SSE: Error in notification check:', error)
    // Don't break the polling loop
  }
}