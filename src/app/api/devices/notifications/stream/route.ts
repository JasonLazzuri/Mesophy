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
    
    // Subscribe to device_notifications table changes for this screen
    const subscription = supabase
      .channel(`notifications:${screenId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_notifications',
          filter: `screen_id=eq.${screenId}`
        },
        async (payload) => {
          try {
            console.log('SSE: Database notification for screen:', screenId, payload)
            
            const notification = payload.new
            
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
            
            console.log('SSE: Content update sent for screen:', screenId)
            
          } catch (error) {
            console.error('SSE: Error processing notification:', error)
          }
        }
      )
      .subscribe((status) => {
        console.log('SSE: Subscription status for screen', screenId, ':', status)
        
        if (status === 'SUBSCRIBED') {
          // Send confirmation that real-time is active
          controller.enqueue(encoder.encode('event: realtime_ready\n'))
          controller.enqueue(encoder.encode('data: {"status":"subscribed","screen_id":"' + screenId + '"}\n\n'))
        }
      })
    
    // Handle cleanup when stream closes
    const originalClose = controller.close.bind(controller)
    controller.close = () => {
      console.log('SSE: Cleaning up subscription for screen:', screenId)
      clearInterval(heartbeatInterval)
      supabase.removeChannel(subscription)
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