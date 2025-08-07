import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    const body = await request.json()
    
    const {
      status = 'online',
      system_info = {},
      display_info = {},
      current_content = null,
      error_info = null
    } = body

    if (!deviceToken) {
      return NextResponse.json({ 
        error: 'Device token required' 
      }, { status: 401 })
    }

    console.log('Pi device heartbeat:', { 
      deviceToken: deviceToken.substring(0, 10) + '...', 
      status, 
      current_content: current_content?.name || 'None'
    })

    // Use service role client for device operations
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    )

    // Find screen by device token
    const { data: screen, error: screenError } = await adminSupabase
      .from('screens')
      .select('id, name, device_id, sync_version')
      .eq('device_token', deviceToken)
      .single()

    if (screenError || !screen) {
      console.error('Screen not found for device token:', screenError)
      return NextResponse.json({ 
        error: 'Invalid device token' 
      }, { status: 401 })
    }

    // Update screen status and last seen
    const updateData = {
      device_status: status as 'online' | 'offline' | 'error' | 'maintenance',
      last_seen: new Date().toISOString(),
      device_info: {
        ...system_info,
        display_info,
        current_content,
        last_heartbeat: new Date().toISOString()
      }
    }

    const { error: updateError } = await adminSupabase
      .from('screens')
      .update(updateData)
      .eq('id', screen.id)

    if (updateError) {
      console.error('Failed to update screen status:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update device status' 
      }, { status: 500 })
    }

    // Log the heartbeat with appropriate level
    const logLevel = status === 'error' ? 'error' : 
                    status === 'maintenance' ? 'warning' : 
                    error_info ? 'warning' : 'debug'
    
    const logMessage = error_info ? 
      `Heartbeat with error: ${error_info.message || 'Unknown error'}` :
      `Heartbeat: Device ${status}`

    await adminSupabase
      .from('device_logs')
      .insert({
        screen_id: screen.id,
        log_level: logLevel,
        message: logMessage,
        metadata: {
          device_id: screen.device_id,
          system_info,
          display_info,
          current_content,
          error_info,
          heartbeat_time: new Date().toISOString()
        }
      })

    // Check if sync is needed (this could be more sophisticated)
    const now = new Date()
    const lastSync = new Date(screen.last_sync_at || 0)
    const syncAge = (now.getTime() - lastSync.getTime()) / 1000 / 60 // minutes
    const syncRequired = syncAge > 5 || screen.sync_version === 0 // Sync if >5 minutes old or never synced

    // Return heartbeat acknowledgment
    return NextResponse.json({
      success: true,
      message: 'Heartbeat received',
      device: {
        screen_id: screen.id,
        screen_name: screen.name,
        device_id: screen.device_id,
        status: status,
        last_seen: new Date().toISOString()
      },
      sync_recommended: syncRequired,
      sync_url: '/api/devices/sync',
      next_heartbeat_in: 300 // seconds (5 minutes)
    }, { status: 200 })

  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow CORS for Pi devices
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}