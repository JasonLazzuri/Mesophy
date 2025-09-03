import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Polling endpoint for Android TV devices to check for content notifications
 * Replaces the failing SSE system with reliable HTTP polling
 */

export async function GET(request: NextRequest) {
  try {
    // Get authentication and screen ID from headers
    const authorization = request.headers.get('authorization')
    const screenId = request.headers.get('x-screen-id')
    
    if (!authorization) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }
    
    if (!screenId) {
      return NextResponse.json(
        { error: 'X-Screen-ID header required' },
        { status: 400 }
      )
    }
    
    // Extract token from Bearer authorization
    const token = authorization.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { error: 'Invalid authorization format' },
        { status: 401 }
      )
    }
    
    // Get optional since timestamp for incremental polling
    const sinceParam = request.nextUrl.searchParams.get('since')
    const sinceTimestamp = sinceParam ? new Date(sinceParam).toISOString() : null
    
    // Create Supabase client with the device token
    const supabase = createClient()
    
    // Set the JWT token for authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }
    
    // Get pending notifications for this device
    const { data: notifications, error } = await supabase
      .rpc('get_device_notifications', {
        p_screen_id: screenId,
        p_since_timestamp: sinceTimestamp
      })
    
    if (error) {
      console.error('Error fetching device notifications:', error)
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      )
    }
    
    // If there are notifications, mark them as processed
    const notificationIds = notifications?.map(n => n.id) || []
    let processedCount = 0
    
    if (notificationIds.length > 0) {
      const { data: markResult, error: markError } = await supabase
        .rpc('mark_notifications_processed', {
          p_notification_ids: notificationIds
        })
      
      if (markError) {
        console.error('Error marking notifications as processed:', markError)
        // Don't fail the request, just log the error
      } else {
        processedCount = markResult || 0
      }
    }
    
    // Return polling response
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      screen_id: screenId,
      notifications: notifications || [],
      has_updates: notifications && notifications.length > 0,
      processed_count: processedCount,
      polling_interval_seconds: 15, // Recommended next poll interval
      method: 'http_polling'
    }
    
    console.log(`[${new Date().toISOString()}] 📊 Polling request from screen: ${screenId}`)
    console.log(`  - Notifications found: ${notifications?.length || 0}`)
    console.log(`  - Since timestamp: ${sinceTimestamp || 'initial'}`)
    console.log(`  - Processed: ${processedCount}`)
    
    if (notifications && notifications.length > 0) {
      console.log(`[${new Date().toISOString()}] 🔔 Delivering ${notifications.length} notifications via HTTP polling`)
      notifications.forEach((notification, index) => {
        console.log(`  ${index + 1}. ${notification.change_type}: ${notification.change_data?.message || notification.change_data?.playlist_name || 'update'}`)
      })
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('Polling endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        success: false
      },
      { status: 500 }
    )
  }
}

/**
 * Health check endpoint for polling system
 */
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Polling-Available': 'true',
      'X-Polling-Interval': '15'
    }
  })
}