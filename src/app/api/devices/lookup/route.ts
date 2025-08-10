import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const deviceId = searchParams.get('device_id')
    
    if (!deviceId) {
      return NextResponse.json({ 
        error: 'device_id parameter is required' 
      }, { status: 400 })
    }

    console.log('Pi device lookup request:', { deviceId })

    // Use service role client for device operations since this is unauthenticated
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

    // Look up screen by device_id
    const { data: screen, error: screenError } = await adminSupabase
      .from('screens')
      .select(`
        id,
        name,
        screen_type,
        device_id,
        device_token,
        device_status,
        resolution,
        orientation,
        is_active,
        locations (
          id,
          name,
          timezone,
          districts (
            id,
            name,
            organization_id
          )
        )
      `)
      .eq('device_id', deviceId)
      .single()

    if (screenError || !screen) {
      // Device not paired
      return NextResponse.json({ 
        paired: false,
        message: 'Device not found in system. Please pair this device through the admin portal.',
        device_id: deviceId
      }, { status: 200 })
    }

    // Check if device has a valid token (fully paired)
    if (!screen.device_token) {
      return NextResponse.json({ 
        paired: false,
        message: 'Device registration incomplete. Please complete pairing through the admin portal.',
        device_id: deviceId
      }, { status: 200 })
    }

    // Update last seen timestamp
    await adminSupabase
      .from('screens')
      .update({
        last_seen: new Date().toISOString(),
        device_status: 'online'
      })
      .eq('device_id', deviceId)

    // Return paired device info
    return NextResponse.json({
      paired: true,
      device: {
        device_id: deviceId,
        screen_id: screen.id,
        screen_name: screen.name,
        screen_type: screen.screen_type,
        device_token: screen.device_token,
        resolution: screen.resolution,
        orientation: screen.orientation,
        is_active: screen.is_active,
        location: screen.locations,
        content_url: `/api/screens/${screen.id}/current-content`,
        sync_url: `/api/devices/sync?device_token=${screen.device_token}`,
        heartbeat_url: `/api/devices/${deviceId}/heartbeat`
      }
    }, { status: 200 })

  } catch (error) {
    console.error('Device lookup error:', error)
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}