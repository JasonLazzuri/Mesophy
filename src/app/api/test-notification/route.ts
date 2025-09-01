import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/test-notification
 * 
 * Creates a test notification for the Android TV device to verify the notification system is working
 */
export async function POST(request: NextRequest) {
  try {
    // Get Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing Supabase configuration')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Android TV screen ID (from logs)
    const androidTVScreenId = '003a361b-681d-4299-8337-bd7e5c09d1ed'
    
    // Parse request body for custom message
    const { message, title, type } = await request.json().catch(() => ({}))
    
    // Create test notification
    const { data: notification, error: notificationError } = await supabase
      .from('device_notifications')
      .insert({
        screen_id: androidTVScreenId,
        notification_type: type || 'system_message',
        title: title || `Test Notification ${new Date().toLocaleTimeString()}`,
        message: message || 'This is a test notification to verify the SSE delivery system is working.',
        priority: 3,
        payload: {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'api_test_endpoint'
        }
      })
      .select()
      .single()
    
    if (notificationError) {
      console.error('Error creating test notification:', notificationError)
      return NextResponse.json({ 
        error: 'Failed to create test notification',
        details: notificationError.message 
      }, { status: 500 })
    }
    
    console.log('Test notification created successfully:', notification.id)
    
    return NextResponse.json({
      success: true,
      message: 'Test notification created and should appear on Android TV within 2-5 seconds',
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.notification_type,
        created_at: notification.created_at
      },
      instructions: 'Check Android TV logs for SSE events containing this notification'
    })
    
  } catch (error) {
    console.error('Test notification error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/test-notification
 * 
 * Get recent test notifications to verify they were delivered
 */
export async function GET(request: NextRequest) {
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
    
    // Get recent notifications for the Android TV
    const { data: notifications, error } = await supabase
      .from('device_notifications')
      .select('*')
      .eq('screen_id', androidTVScreenId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (error) {
      return NextResponse.json({ 
        error: 'Failed to fetch notifications',
        details: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      screen_id: androidTVScreenId,
      notifications: notifications || [],
      summary: {
        total: notifications?.length || 0,
        delivered: notifications?.filter(n => n.delivered_at).length || 0,
        pending: notifications?.filter(n => !n.delivered_at).length || 0
      }
    })
    
  } catch (error) {
    console.error('Get test notifications error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}