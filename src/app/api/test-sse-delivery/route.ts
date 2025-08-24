import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Test endpoint to manually deliver pending notifications via SSE
 * This bypasses the real-time subscription to test SSE delivery directly
 */
export async function GET(request: NextRequest) {
  try {
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    const screenId = request.headers.get('X-Screen-ID')
    
    if (!deviceToken || !screenId) {
      return new NextResponse('Missing auth or screen ID', { status: 400 })
    }
    
    console.log('Test SSE: Starting stream for screen:', screenId)
    
    // Get Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      return new NextResponse('Supabase config missing', { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        // Send connection confirmation
        controller.enqueue(encoder.encode('event: connected\n'))
        controller.enqueue(encoder.encode('data: {"status":"test_connected","timestamp":"' + new Date().toISOString() + '"}\n\n'))
        
        // Get all undelivered notifications for this screen
        const { data: notifications, error } = await supabase
          .from('device_notifications')
          .select('*')
          .eq('screen_id', screenId)
          .is('delivered_at', null)
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('Test SSE: Error fetching notifications:', error)
          controller.enqueue(encoder.encode('event: error\n'))
          controller.enqueue(encoder.encode('data: {"error":"Failed to fetch notifications"}\n\n'))
          return
        }
        
        console.log(`Test SSE: Found ${notifications?.length || 0} undelivered notifications`)
        
        // Send each notification
        if (notifications && notifications.length > 0) {
          for (const notification of notifications) {
            try {
              // Send the notification
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
              
              // Mark as delivered
              await supabase
                .from('device_notifications')
                .update({ delivered_at: new Date().toISOString() })
                .eq('id', notification.id)
              
              console.log('Test SSE: Delivered notification:', notification.title)
              
              // Small delay between notifications
              await new Promise(resolve => setTimeout(resolve, 100))
              
            } catch (error) {
              console.error('Test SSE: Error delivering notification:', error)
            }
          }
        } else {
          controller.enqueue(encoder.encode('event: info\n'))
          controller.enqueue(encoder.encode('data: {"message":"No pending notifications found"}\n\n'))
        }
        
        // Send completion message
        controller.enqueue(encoder.encode('event: test_complete\n'))
        controller.enqueue(encoder.encode('data: {"delivered_count":' + (notifications?.length || 0) + '}\n\n'))
        
        // Close after 2 seconds
        setTimeout(() => {
          controller.close()
        }, 2000)
      }
    })
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, X-Screen-ID',
      },
    })
    
  } catch (error) {
    console.error('Test SSE: Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

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