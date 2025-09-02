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
    
    let supabase = createClient(supabaseUrl, serviceKey)
    let supabaseCreatedAt = new Date()
    const encoder = new TextEncoder()
    
    // Function to refresh Supabase connection if it's getting old
    const refreshSupabaseConnection = () => {
      const connectionAge = new Date().getTime() - supabaseCreatedAt.getTime()
      // Refresh connection every 4 minutes to prevent 5-minute timeouts
      if (connectionAge > 240000) { // 4 minutes
        console.log(`SSE: Refreshing Supabase connection for screen:`, screenId, 'Age:', Math.round(connectionAge/1000), 'seconds')
        supabase = createClient(supabaseUrl, serviceKey)
        supabaseCreatedAt = new Date()
        return true
      }
      return false
    }
    
    // Use polling instead of real-time subscriptions (more reliable)
    // Start from 5 minutes ago to catch any notifications that were created before SSE started
    let lastCheckedTime = new Date(Date.now() - 5 * 60 * 1000)
    
    const checkForNotifications = async () => {
      try {
        // Refresh database connection if needed to prevent timeouts
        const wasRefreshed = refreshSupabaseConnection()
        if (wasRefreshed) {
          console.log(`SSE: Using fresh database connection for screen:`, screenId)
        }
        
        // Get all undelivered notifications (don't filter by time on first check)
        // This ensures we catch notifications created before SSE connection started
        console.log(`SSE: Checking for notifications for screen:`, screenId, 'at', new Date().toISOString())
        const { data: notifications, error } = await supabase
          .from('device_notifications')
          .select('*')
          .eq('screen_id', screenId)
          .is('delivered_at', null)
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('SSE: Database query failed for screen:', screenId, error)
          throw new Error(`Database query failed: ${error.message}`)
        }
        
        if (notifications && notifications.length > 0) {
          console.log(`SSE: ✅ Found ${notifications.length} new notifications for screen:`, screenId)
          notifications.forEach(n => console.log(`  → Notification: "${n.title}" (${n.notification_type}) created ${n.created_at}`))
          
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
        } else {
          console.log(`SSE: ℹ️  No new notifications found for screen:`, screenId, 'Query completed successfully')
        }
      } catch (error) {
        console.error('SSE: Critical error in checkForNotifications for screen:', screenId, error)
        throw error  // Re-throw to be handled by heartbeat error handling
      }
    }
    
    // Replace the 2-second polling with heartbeat-based notification checking
    // Clear the original heartbeat interval and create a combined one
    clearInterval(heartbeatInterval)
    
    // Track heartbeat and database health
    let heartbeatCount = 0
    let lastDatabaseSuccess = new Date()
    let lastDatabaseError = null
    
    // Create combined heartbeat + notification checking interval
    const combinedHeartbeatInterval = setInterval(async () => {
      heartbeatCount++
      const heartbeatTime = new Date().toISOString()
      
      try {
        // Send heartbeat ping
        controller.enqueue(encoder.encode("event: ping\n"))
        controller.enqueue(encoder.encode("data: {\"timestamp\":\"" + heartbeatTime + "\",\"heartbeat\":" + heartbeatCount + "}\n\n"))
        console.log(`SSE: Heartbeat #${heartbeatCount} sent for screen:`, screenId)
        
        // Check for notifications during heartbeat with proper error handling
        try {
          await checkForNotifications()
          lastDatabaseSuccess = new Date()
          if (lastDatabaseError) {
            console.log(`SSE: Database connection recovered for screen:`, screenId)
            lastDatabaseError = null
          }
        } catch (dbError) {
          lastDatabaseError = dbError
          console.error(`SSE: Database error during heartbeat #${heartbeatCount} for screen:`, screenId, dbError)
          
          // If database has been failing for >2 minutes, log warning
          if (new Date().getTime() - lastDatabaseSuccess.getTime() > 120000) {
            console.warn(`SSE: Database connection failing for >2min for screen:`, screenId, 'Last success:', lastDatabaseSuccess)
          }
        }
      } catch (heartbeatError) {
        console.error(`SSE: Heartbeat #${heartbeatCount} failed for screen:`, screenId, heartbeatError)
        clearInterval(combinedHeartbeatInterval)
      }
    }, 15000) // 15 second heartbeat - more frequent for better connection stability
    
    // Send confirmation that heartbeat-based polling is active
    controller.enqueue(encoder.encode("event: realtime_ready\n"))
    controller.enqueue(encoder.encode("data: {\"status\":\"heartbeat_polling_active\",\"screen_id\":\"" + screenId + "\",\"check_interval\":\"15s\"}\n\n"))    
    // Handle cleanup when stream closes
    const originalClose = controller.close.bind(controller)
    controller.close = () => {
      console.log('SSE: Cleaning up polling for screen:', screenId)
      clearInterval(heartbeatInterval)
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