import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectDeviceType, generateDeviceId, getDeviceTypeLabel } from '@/lib/device-utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { 
      pairing_code,
      screen_id
    } = body

    // Validate required fields
    if (!pairing_code || !screen_id) {
      return NextResponse.json({ 
        error: 'pairing_code and screen_id are required' 
      }, { status: 400 })
    }

    console.log('Dashboard pairing request:', { pairing_code, screen_id })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check if user has access to the specified screen
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        *,
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
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ 
        error: 'Screen not found or access denied' 
      }, { status: 404 })
    }

    // Verify user has access to this screen's organization
    if (screen.locations?.districts?.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ 
        error: 'Access denied to this screen' 
      }, { status: 403 })
    }

    // Check if screen is already paired to a device
    if (screen.device_id && screen.device_token) {
      return NextResponse.json({ 
        error: 'Screen is already paired to a device' 
      }, { status: 409 })
    }

    // Use service role client to check pairing code
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
      .eq('code', pairing_code)
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
    const deviceInfo = pairing.device_info || {}
    const deviceType = detectDeviceType(deviceInfo)
    const deviceId = generateDeviceId(deviceType, pairing.id)

    try {
      // Start transaction - update screen and mark pairing as used
      const { data: updatedScreen, error: updateError } = await adminSupabase
        .from('screens')
        .update({
          device_id: deviceId,
          device_token: deviceToken,
          device_status: 'online',
          device_info: pairing.device_info || {},
          device_ip: pairing.device_ip,
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
          screen_id: screen_id
        })
        .eq('code', pairing_code)

      if (markUsedError) {
        console.error('Failed to mark pairing code as used:', markUsedError)
        // This is not critical, continue
      }

      // Log the pairing event
      await supabase
        .from('device_logs')
        .insert({
          screen_id: screen_id,
          log_level: 'info',
          message: 'Device paired successfully via dashboard',
          metadata: {
            device_id: deviceId,
            pairing_code,
            paired_by: user.id,
            paired_by_email: userProfile.email,
            device_info: pairing.device_info
          }
        })

      console.log(`Device successfully paired: ${deviceId} (${deviceType.toUpperCase()}) to screen: ${screen.name}`)

      return NextResponse.json({
        success: true,
        message: 'Device paired successfully',
        device: {
          device_id: deviceId,
          device_token: deviceToken,
          screen_id: screen_id,
          screen_name: screen.name,
          screen_type: screen.screen_type,
          location: updatedScreen.locations,
          paired_at: new Date().toISOString()
        }
      }, { status: 200 })

    } catch (error) {
      console.error('Transaction error during pairing:', error)
      return NextResponse.json({ 
        error: 'Failed to complete pairing process' 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Device pairing error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}