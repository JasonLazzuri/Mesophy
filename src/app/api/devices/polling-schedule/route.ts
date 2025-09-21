import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Device Polling Schedule API
 * Returns current polling interval for authenticated devices based on organization configuration
 */

export async function GET(request: NextRequest) {
  try {
    const deviceId = request.headers.get('x-device-id') || request.headers.get('x-screen-id')
    const deviceToken = request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!deviceId) {
      return NextResponse.json(
        { error: 'X-Device-ID or X-Screen-ID header required' },
        { status: 400 }
      )
    }

    if (!deviceToken) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }

    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get device information and verify token
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        device_token,
        organization_id,
        location_id,
        locations!inner (
          organization_id
        )
      `)
      .eq('id', deviceId)
      .eq('device_token', deviceToken)
      .single()

    if (screenError || !screen) {
      console.error('Device authentication failed:', screenError)
      return NextResponse.json(
        { error: 'Invalid device credentials' },
        { status: 401 }
      )
    }

    // Get current polling interval using the database function
    const { data: intervalData, error: intervalError } = await supabase
      .rpc('get_current_polling_interval', {
        p_organization_id: screen.organization_id
      })

    if (intervalError) {
      console.error('Error getting polling interval:', intervalError)
      // Return a safe default if database function fails
      return NextResponse.json({
        success: true,
        polling_schedule: {
          interval_seconds: 900, // 15 minutes default
          is_emergency: false,
          current_period_name: 'fallback',
          timezone: 'America/Los_Angeles'
        },
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        fallback_mode: true
      })
    }

    // Extract the result (rpc returns an array)
    const interval = intervalData && intervalData.length > 0 ? intervalData[0] : null

    if (!interval) {
      // Return default if no configuration found
      return NextResponse.json({
        success: true,
        polling_schedule: {
          interval_seconds: 900,
          is_emergency: false,
          current_period_name: 'default',
          timezone: 'America/Los_Angeles'
        },
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        fallback_mode: true
      })
    }

    // Calculate next check time (devices should check for schedule updates periodically)
    const nextScheduleCheck = new Date()
    nextScheduleCheck.setMinutes(nextScheduleCheck.getMinutes() + 30) // Check every 30 minutes

    return NextResponse.json({
      success: true,
      polling_schedule: {
        interval_seconds: interval.interval_seconds,
        is_emergency: interval.is_emergency,
        current_period_name: interval.current_period_name,
        timezone: interval.timezone,
        next_schedule_check: nextScheduleCheck.toISOString()
      },
      device_id: deviceId,
      organization_id: screen.organization_id,
      timestamp: new Date().toISOString(),
      fallback_mode: false
    })

  } catch (error) {
    console.error('Device polling schedule error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        polling_schedule: {
          interval_seconds: 900, // Safe fallback
          is_emergency: false,
          current_period_name: 'error_fallback',
          timezone: 'America/Los_Angeles'
        },
        fallback_mode: true,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * Health check endpoint for polling schedule service
 */
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Service': 'polling-schedule',
      'X-Version': '1.0'
    }
  })
}