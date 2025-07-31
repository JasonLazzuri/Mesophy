import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { DeviceStatus } from '@/types/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Parse request body
    const body = await request.json()
    const { 
      device_status, 
      ip_address, 
      firmware_version,
      system_info 
    } = body

    // Validate device status if provided
    let newStatus: DeviceStatus = 'online'
    if (device_status) {
      const validStatuses: DeviceStatus[] = ['online', 'offline', 'error', 'maintenance']
      if (!validStatuses.includes(device_status)) {
        return NextResponse.json({ 
          error: 'Invalid device status' 
        }, { status: 400 })
      }
      newStatus = device_status
    }

    // Get the screen to verify it exists
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('id, device_id, name, location_id')
      .eq('id', params.id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Update the screen's last heartbeat and status
    const updateData: any = {
      last_heartbeat: new Date().toISOString(),
      device_status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (ip_address) {
      updateData.ip_address = ip_address.trim()
    }

    if (firmware_version) {
      updateData.firmware_version = firmware_version.trim()
    }

    const { data: updatedScreen, error: updateError } = await supabase
      .from('screens')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating screen heartbeat:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update heartbeat' 
      }, { status: 500 })
    }

    // Log the heartbeat event
    const logMessage = `Heartbeat received - Status: ${newStatus}`
    const logMetadata: any = {
      device_status: newStatus,
      ip_address: ip_address || null,
      firmware_version: firmware_version || null
    }

    if (system_info) {
      logMetadata.system_info = system_info
    }

    const { error: logError } = await supabase
      .from('device_logs')
      .insert({
        screen_id: params.id,
        log_level: 'info',
        message: logMessage,
        metadata: logMetadata
      })

    if (logError) {
      console.error('Error creating device log:', logError)
      // Don't fail the heartbeat if logging fails
    }

    return NextResponse.json({ 
      message: 'Heartbeat recorded successfully',
      screen: updatedScreen,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in heartbeat API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Allow GET requests to check heartbeat status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get the screen's heartbeat information
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('id, name, device_status, last_heartbeat, ip_address, firmware_version')
      .eq('id', params.id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Calculate time since last heartbeat
    let timeSinceHeartbeat = null
    let isStale = false
    
    if (screen.last_heartbeat) {
      const heartbeatTime = new Date(screen.last_heartbeat)
      const now = new Date()
      timeSinceHeartbeat = Math.floor((now.getTime() - heartbeatTime.getTime()) / 1000) // seconds
      
      // Consider stale if no heartbeat for more than 5 minutes
      isStale = timeSinceHeartbeat > 300
    }

    return NextResponse.json({ 
      screen_id: screen.id,
      name: screen.name,
      device_status: screen.device_status,
      last_heartbeat: screen.last_heartbeat,
      time_since_heartbeat_seconds: timeSinceHeartbeat,
      is_stale: isStale,
      ip_address: screen.ip_address,
      firmware_version: screen.firmware_version,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in heartbeat GET API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}