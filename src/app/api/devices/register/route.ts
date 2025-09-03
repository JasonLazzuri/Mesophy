import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectDeviceType, getDeviceTypeLabel } from '@/lib/device-utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { 
      device_id, 
      screen_id, 
      device_info = {} 
    } = body

    // Validate required fields
    if (!device_id || !screen_id) {
      return NextResponse.json({ 
        error: 'device_id and screen_id are required' 
      }, { status: 400 })
    }

    // Validate device_id format (MAC address or UUID)
    const deviceIdRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    if (!deviceIdRegex.test(device_id)) {
      return NextResponse.json({ 
        error: 'Invalid device_id format. Must be MAC address or UUID' 
      }, { status: 400 })
    }

    const deviceType = detectDeviceType(device_info)
    const deviceTypeLabel = getDeviceTypeLabel(deviceType)
    console.log(`${deviceTypeLabel} device registration attempt:`, { device_id, screen_id, device_info })

    // Check if screen exists and is available
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        location_id,
        locations (
          id,
          name,
          timezone,
          districts (
            id,
            name,
            organizations (
              id,
              name
            )
          )
        )
      `)
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      console.error('Screen not found:', screenError)
      return NextResponse.json({ 
        error: 'Screen not found or access denied' 
      }, { status: 404 })
    }

    // Check if screen is already registered to a different device
    if (screen.device_id && screen.device_id !== device_id) {
      return NextResponse.json({ 
        error: 'Screen is already registered to another device' 
      }, { status: 409 })
    }

    // Check if device is already registered to a different screen
    const { data: existingScreen, error: existingError } = await supabase
      .from('screens')
      .select('id, name')
      .eq('device_id', device_id)
      .neq('id', screen_id)
      .single()

    if (existingScreen && !existingError) {
      return NextResponse.json({ 
        error: `Device is already registered to screen: ${existingScreen.name}` 
      }, { status: 409 })
    }

    // Register/update the device
    const updateData = {
      device_id,
      device_status: 'online' as const,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: updatedScreen, error: updateError } = await supabase
      .from('screens')
      .update(updateData)
      .eq('id', screen_id)
      .select(`
        id,
        name,
        screen_type,
        device_id,
        resolution,
        orientation,
        locations (
          id,
          name,
          timezone
        )
      `)
      .single()

    if (updateError) {
      console.error('Failed to register device:', updateError)
      return NextResponse.json({ 
        error: 'Failed to register device' 
      }, { status: 500 })
    }

    // Log the registration event
    await supabase
      .from('device_logs')
      .insert({
        screen_id: screen_id,
        log_level: 'info',
        message: 'Device registered successfully',
        metadata: {
          device_id,
          device_info,
          registration_time: new Date().toISOString()
        }
      })

    console.log(`${deviceTypeLabel} device registered successfully:`, device_id)

    // Return registration success with device config
    return NextResponse.json({
      success: true,
      message: 'Device registered successfully',
      device: {
        id: device_id,
        screen_id: updatedScreen.id,
        screen_name: updatedScreen.name,
        screen_type: updatedScreen.screen_type,
        resolution: updatedScreen.resolution,
        orientation: updatedScreen.orientation,
        location: updatedScreen.locations,
        sync_url: `/api/devices/${device_id}/sync`,
        heartbeat_url: `/api/devices/${device_id}/heartbeat`
      }
    }, { status: 200 })

  } catch (error) {
    console.error('Device registration error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}