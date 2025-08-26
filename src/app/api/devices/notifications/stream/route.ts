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
        
        // Send periodic heartbeat to keep connection alive
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
    
    // Use polling instead of real-time subscriptions (more reliable)
    // Start from 5 minutes ago to catch any notifications that were created before SSE started
    let lastCheckedTime = new Date(Date.now() - 5 * 60 * 1000)
    
    const checkForNotifications = async () => {
      try {
        // Get all undelivered notifications (don't filter by time on first check)
        // This ensures we catch notifications created before SSE connection started
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
              
              // Mark notification as delivered
              await supabase
                .from('device_notifications')
                .update({ delivered_at: new Date().toISOString() })
                .eq('id', notification.id)
              
              console.log('SSE: Content update sent for screen:', screenId, '- title:', notification.title)
              
            } catch (error) {
              console.error('SSE: Error delivering notification:', error)
            }
          }
          
          lastCheckedTime = new Date()
        }
      } catch (error) {
        console.error('SSE: Error in notification check:', error)
      }
    }
    
    // Check for notifications every 2 seconds
    const notificationInterval = setInterval(checkForNotifications, 2000)
    
    // Send confirmation that polling is active
    controller.enqueue(encoder.encode('event: realtime_ready\n'))
    controller.enqueue(encoder.encode('data: {"status":"polling_active","screen_id":"' + screenId + '","check_interval":"2s"}\n\n'))
    
    // Handle cleanup when stream closes
    const originalClose = controller.close.bind(controller)
    controller.close = () => {
      console.log('SSE: Cleaning up polling for screen:', screenId)
      clearInterval(heartbeatInterval)
      clearInterval(notificationInterval)
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