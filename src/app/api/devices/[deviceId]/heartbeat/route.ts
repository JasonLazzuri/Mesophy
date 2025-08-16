import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: {
    deviceId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { deviceId } = params
    const body = await request.json()
    
    const {
      status = 'online',
      system_info = {},
      display_info = {},
      error_info = null
    } = body

    console.log(`Heartbeat from device ${deviceId}:`, { status, system_info, display_info })

    // Find the screen associated with this device
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('id, name, location_id')
      .eq('device_id', deviceId)
      .single()

    if (screenError || !screen) {
      console.log('Screen not found for device:', deviceId, 'Error:', screenError?.message)
      
      // Log the heartbeat attempt even for unregistered devices for debugging
      console.log('Heartbeat from unregistered device:', {
        deviceId,
        status,
        system_info,
        display_info,
        timestamp: new Date().toISOString()
      })
      
      // Return success to prevent log spam, but indicate device needs registration
      return NextResponse.json({ 
        success: false,
        message: 'Device not registered in any screen',
        device_id: deviceId,
        requires_pairing: true
      }, { status: 200 })
    }

    // Update screen status and last_seen
    const updateData = {
      device_status: status as 'online' | 'offline' | 'error' | 'maintenance',
      last_seen: new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('screens')
      .update(updateData)
      .eq('id', screen.id)

    if (updateError) {
      console.error('Failed to update screen status:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update device status' 
      }, { status: 500 })
    }

    // Log the heartbeat
    const logLevel = status === 'error' ? 'error' : 
                    status === 'maintenance' ? 'warning' : 'debug'
    
    await supabase
      .from('device_logs')
      .insert({
        screen_id: screen.id,
        log_level: logLevel,
        message: `Heartbeat: Device status ${status}`,
        metadata: {
          device_id: deviceId,
          system_info,
          display_info,
          error_info,
          heartbeat_time: new Date().toISOString()
        }
      })

    // Check if content needs to be synced
    const { data: activeSchedules, error: schedulesError } = await supabase
      .from('schedules')
      .select(`
        id,
        name,
        playlist_id,
        start_time,
        end_time,
        days_of_week,
        priority,
        playlists (
          id,
          name,
          updated_at
        )
      `)
      .eq('screen_id', screen.id)
      .eq('is_active', true)
      .gte('end_date', new Date().toISOString().split('T')[0])
      .lte('start_date', new Date().toISOString().split('T')[0])

    // Return heartbeat acknowledgment with sync info
    return NextResponse.json({
      success: true,
      message: 'Heartbeat received',
      device: {
        id: deviceId,
        screen_id: screen.id,
        screen_name: screen.name,
        status: status,
        last_seen: new Date().toISOString()
      },
      sync_required: schedulesError ? false : (activeSchedules?.length || 0) > 0,
      active_schedules_count: activeSchedules?.length || 0,
      next_sync_url: `/api/devices/${deviceId}/sync`
    }, { status: 200 })

  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow OPTIONS for CORS
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