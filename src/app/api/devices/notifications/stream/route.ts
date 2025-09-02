import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/devices/notifications/stream
 * 
 * Server-Sent Events endpoint for real-time content notifications
 * Streams real-time updates to Android TV devices when content changes
 */
export async function GET(request: NextRequest) {
  try {
    // Get device authentication
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    const screenId = request.headers.get('X-Screen-ID')
    
    if (!deviceToken) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    
    if (!screenId) {
      return new NextResponse('Screen ID required', { status: 400 })
    }
    
    console.log('SSE: Starting stream for screen:', screenId)
    
    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection confirmation
        const encoder = new TextEncoder()
        
        // Send SSE connection established message
        controller.enqueue(encoder.encode('event: connected\n'))
        controller.enqueue(encoder.encode('data: {"status":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n'))
        
        // Send periodic heartbeat to keep connection alive and check for notifications
        const heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode('event: ping\n'))
            controller.enqueue(encoder.encode('data: {"timestamp":"' + new Date().toISOString() + '"}\n\n'))
            
          } catch (error) {
            console.log('SSE heartbeat failed, client likely disconnected')
            clearInterval(heartbeatInterval)
          }
        }, 30000) // 30 second heartbeat
        
        // Set up database listener for content changes
        setupDatabaseListener(controller, screenId, heartbeatInterval)
        
        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log('SSE: Client disconnected for screen:', screenId)
          clearInterval(heartbeatInterval)
          controller.close()
        })
      }
    })
    
    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, X-Screen-ID',
        'X-Accel-Buffering': 'no', // Nginx: disable buffering for SSE
      },
    })
    
  } catch (error) {
    console.error('SSE: Error starting stream:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

/**
 * Set up database listener for real-time notifications
 */
async function setupDatabaseListener(
  controller: ReadableStreamDefaultController,
  screenId: string,
  heartbeatInterval: NodeJS.Timeout
) {
  try {
    // Get Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      console.error('SSE: Missing Supabase configuration')
      return
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    const encoder = new TextEncoder()
    
    console.log(`SSE: Setting up real-time push notifications for screen:`, screenId)
    
    // Track notification delivery stats
    let notificationsSent = 0
    let lastNotificationTime = null
    
    // Function to deliver a single notification via SSE
    const deliverNotification = async (notification) => {
      try {
        notificationsSent++
        lastNotificationTime = new Date()
        
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
        
        console.log(`SSE: 🚀 PUSH notification delivered instantly to screen:`, screenId, `"${notification.title}" (${notification.notification_type})`)
        
        // Mark notification as delivered
        const { error } = await supabase
          .from('device_notifications')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', notification.id)
        
        if (error) {
          console.error('SSE: Error marking notification as delivered:', error)
        }
        
      } catch (error) {
        console.error('SSE: Error delivering push notification:', error)
      }
    }
    
    // Get any existing undelivered notifications first (catch-up)
    const catchUpMissedNotifications = async () => {
      try {
        console.log(`SSE: Checking for any missed notifications for screen:`, screenId)
        const { data: notifications, error } = await supabase
          .from('device_notifications')
          .select('*')
          .eq('screen_id', screenId)
          .is('delivered_at', null)
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('SSE: Error during notification catch-up:', error)
          return
        }
        
        if (notifications && notifications.length > 0) {
          console.log(`SSE: 📦 Catching up ${notifications.length} missed notifications for screen:`, screenId)
          for (const notification of notifications) {
            await deliverNotification(notification)
          }
        } else {
          console.log(`SSE: ✅ No missed notifications for screen:`, screenId)
        }
      } catch (error) {
        console.error('SSE: Error in notification catch-up:', error)
      }
    }
    
    // Set up TRUE REAL-TIME push notifications (no polling!)
    console.log(`SSE: 🎯 Setting up real-time subscription for screen:`, screenId)
    
    const realtimeChannel = supabase
      .channel(`notifications-${screenId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_notifications',
          filter: `screen_id=eq.${screenId}`
        },
        (payload) => {
          console.log(`SSE: 🔥 REAL-TIME notification received for screen:`, screenId, payload.new)
          deliverNotification(payload.new)
        }
      )
      .subscribe((status) => {
        console.log(`SSE: Real-time subscription status for screen:`, screenId, status)
      })
    
    // Catch up on any missed notifications first
    await catchUpMissedNotifications()
    
    // Clear the original heartbeat and create a minimal health-check heartbeat
    clearInterval(heartbeatInterval)
    let heartbeatCount = 0
    
    // Minimal heartbeat for connection health only (no database queries)
    const healthHeartbeat = setInterval(() => {
      heartbeatCount++
      try {
        controller.enqueue(encoder.encode("event: ping\n"))
        controller.enqueue(encoder.encode(`data: {\"timestamp\":\"${new Date().toISOString()}\",\"heartbeat\":${heartbeatCount},\"notifications_sent\":${notificationsSent},\"last_notification\":\"${lastNotificationTime ? lastNotificationTime.toISOString() : 'none'}\"}\n\n`))
        console.log(`SSE: ❤️  Health heartbeat #${heartbeatCount} for screen:`, screenId, `(${notificationsSent} notifications sent)`)
      } catch (error) {
        console.error(`SSE: Health heartbeat failed for screen:`, screenId, error)
        clearInterval(healthHeartbeat)
      }
    }, 45000) // 45 second heartbeat - only for connection health
    
    // Send confirmation that REAL-TIME push notifications are active
    controller.enqueue(encoder.encode("event: realtime_ready\n"))
    controller.enqueue(encoder.encode(`data: {\"status\":\"realtime_push_active\",\"screen_id\":\"${screenId}\",\"method\":\"supabase_realtime\",\"polling\":\"disabled\"}\n\n`))    
    // Handle cleanup when stream closes
    const originalClose = controller.close.bind(controller)
    controller.close = () => {
      console.log(`SSE: 🧹 Cleaning up real-time subscription for screen:`, screenId, `(${notificationsSent} notifications sent)`)
      clearInterval(healthHeartbeat)
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
        console.log(`SSE: Real-time channel unsubscribed for screen:`, screenId)
      }
      originalClose()
    }
    
  } catch (error) {
    console.error('SSE: Error setting up database listener:', error)
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, X-Screen-ID',
    },
  })
}