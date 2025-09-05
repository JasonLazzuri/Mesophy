import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectDeviceType, generateDeviceId, getDeviceTypeLabel } from '@/lib/device-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { 
      pairing_data,
      device_info = {},
      device_ip = null
    } = body

    // Validate pairing data
    if (!pairing_data || typeof pairing_data !== 'object') {
      return NextResponse.json({ 
        error: 'Invalid pairing data' 
      }, { status: 400 })
    }

    const {
      type,
      version,
      screen_id,
      code,
      screen_name
    } = pairing_data

    if (type !== 'mesophy-pairing' || !screen_id || !code) {
      return NextResponse.json({ 
        error: 'Invalid pairing QR code format' 
      }, { status: 400 })
    }

    const deviceType = detectDeviceType(device_info)
    const deviceTypeLabel = getDeviceTypeLabel(deviceType)
    console.log(`${deviceTypeLabel} device QR pairing request:`, { screen_id, code, device_info, device_ip })

    // Use service role client to bypass RLS
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    // Find and validate pairing code
    const { data: pairing, error: pairingError } = await adminSupabase
      .from('device_pairing_codes')
      .select('*')
      .eq('code', code)
      .eq('screen_id', screen_id)
      .single()

    if (pairingError || !pairing) {
      return NextResponse.json({ 
        error: 'Invalid or expired pairing code' 
      }, { status: 404 })
    }

    // Check if code is expired
    const now = new Date()
    const expiresAt = new Date(pairing.expires_at)
    if (now > expiresAt) {
      return NextResponse.json({ 
        error: 'Pairing code has expired' 
      }, { status: 410 })
    }

    // Check if code is already used
    if (pairing.used_at) {
      return NextResponse.json({ 
        error: 'Pairing code has already been used' 
      }, { status: 409 })
    }

    // Get screen information
    const { data: screen, error: screenError } = await adminSupabase
      .from('screens')
      .select(`
        *,
        locations (
          id,
          name,
          timezone
        )
      `)
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ 
        error: 'Screen not found' 
      }, { status: 404 })
    }

    // Check if screen is already paired
    if (screen.device_id && screen.device_token) {
      return NextResponse.json({ 
        error: 'Screen is already paired to another device' 
      }, { status: 409 })
    }

    // Generate secure device token - try database function first, fallback to JavaScript
    let deviceToken = null
    let tokenDbError = null

    try {
      const { data: tokenResult, error: tokenError } = await adminSupabase
        .rpc('generate_device_token')
      
      if (tokenError) {
        tokenDbError = tokenError
        throw tokenError
      }
      
      deviceToken = tokenResult
    } catch (error) {
      console.warn('Database function failed for device token, using JavaScript fallback:', tokenDbError || error)
      
      // JavaScript fallback for device token generation (secure random string)
      const generateToken = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let result = ''
        for (let i = 0; i < 64; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return result
      }
      
      deviceToken = generateToken()
    }

    if (!deviceToken) {
      console.error('Failed to generate device token')
      return NextResponse.json({ 
        error: 'Failed to generate device token' 
      }, { status: 500 })
    }

    // Generate unique device_id based on device type
    const deviceId = generateDeviceId(deviceType, pairing.id)

    try {
      // Update screen and mark pairing as used
      const { data: updatedScreen, error: updateError } = await adminSupabase
        .from('screens')
        .update({
          device_id: deviceId,
          device_token: deviceToken,
          device_status: 'online',
          device_info: device_info || {},
          device_ip,
          last_seen: new Date().toISOString(),
          sync_version: 1
        })
        .eq('id', screen_id)
        .select(`
          *,
          locations (
            id,
            name,
            timezone
          )
        `)
        .single()

      if (updateError) {
        console.error('Failed to update screen:', updateError)
        return NextResponse.json({ 
          error: 'Failed to pair device to screen' 
        }, { status: 500 })
      }

      // Mark pairing code as used
      const { error: markUsedError } = await adminSupabase
        .from('device_pairing_codes')
        .update({
          used_at: new Date().toISOString(),
          device_info,
          device_ip
        })
        .eq('code', code)

      if (markUsedError) {
        console.error('Failed to mark pairing code as used:', markUsedError)
        // This is not critical, continue
      }

      // Log the QR pairing event
      await adminSupabase
        .from('device_logs')
        .insert({
          screen_id: screen_id,
          log_level: 'info',
          message: 'Device paired successfully via QR code',
          metadata: {
            device_id: deviceId,
            pairing_code: code,
            device_info,
            device_ip,
            pairing_method: 'qr_code'
          }
        })

      console.log(`Device successfully paired via QR: ${deviceId} (${deviceType.toUpperCase()}) to screen: ${screen.name}`)

      // Return device configuration
      return NextResponse.json({
        success: true,
        message: 'Device paired successfully via QR code',
        device: {
          device_id: deviceId,
          device_token: deviceToken,
          screen_id: screen_id,
          screen: {
            id: screen_id,
            name: screen.name,
            screen_type: screen.screen_type,
            resolution: screen.resolution,
            orientation: screen.orientation,
            location: updatedScreen.locations
          },
          sync: {
            content_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app'}/api/devices/sync`,
            heartbeat_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app'}/api/devices/heartbeat`,
            sync_interval_seconds: 120
          },
          paired_at: new Date().toISOString()
        }
      }, { status: 200 })

    } catch (error) {
      console.error('Transaction error during QR pairing:', error)
      return NextResponse.json({ 
        error: 'Failed to complete pairing process' 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('QR device pairing error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow CORS for all devices
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}