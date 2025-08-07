import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: {
    code: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { code } = params

    if (!code || code.length !== 6) {
      return NextResponse.json({ 
        error: 'Invalid pairing code format' 
      }, { status: 400 })
    }

    console.log('Pi device checking pairing status for code:', code)

    // Use service role client to bypass RLS
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    )

    // Look for pairing code
    const { data: pairing, error: pairingError } = await adminSupabase
      .from('device_pairing_codes')
      .select(`
        *,
        screens (
          id,
          name,
          screen_type,
          resolution,
          orientation,
          device_token,
          locations (
            id,
            name,
            timezone
          )
        )
      `)
      .eq('code', code)
      .single()

    if (pairingError || !pairing) {
      // Code not found or expired
      if (pairingError?.code === 'PGRST116') {
        return NextResponse.json({ 
          paired: false,
          status: 'code_not_found',
          message: 'Pairing code not found or expired'
        }, { status: 404 })
      }
      
      console.error('Error checking pairing code:', pairingError)
      return NextResponse.json({ 
        error: 'Failed to check pairing status' 
      }, { status: 500 })
    }

    // Check if code is expired
    const now = new Date()
    const expiresAt = new Date(pairing.expires_at)
    if (now > expiresAt) {
      return NextResponse.json({ 
        paired: false,
        status: 'expired',
        message: 'Pairing code has expired'
      }, { status: 410 })
    }

    // Check if already paired
    if (pairing.used_at && pairing.screen_id && pairing.screens) {
      console.log('Pi device successfully paired to screen:', pairing.screens.name)
      
      // Return complete device configuration
      return NextResponse.json({ 
        paired: true,
        status: 'paired',
        message: 'Device successfully paired',
        device_config: {
          device_token: pairing.screens.device_token,
          screen_id: pairing.screen_id,
          screen_name: pairing.screens.name,
          screen_type: pairing.screens.screen_type,
          resolution: pairing.screens.resolution,
          orientation: pairing.screens.orientation,
          location: pairing.screens.locations,
          api_base: process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app',
          sync_interval: 120, // seconds
          heartbeat_interval: 300, // seconds
          api_endpoints: {
            sync: `/api/devices/sync`,
            heartbeat: `/api/devices/heartbeat`,
            logs: `/api/devices/logs`
          }
        }
      }, { status: 200 })
    }

    // Not yet paired, but code is valid
    return NextResponse.json({ 
      paired: false,
      status: 'waiting',
      message: 'Waiting for pairing to be completed',
      expires_at: pairing.expires_at,
      time_remaining: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
    }, { status: 202 })

  } catch (error) {
    console.error('Check pairing error:', error)
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}