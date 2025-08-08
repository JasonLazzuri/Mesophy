import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'

interface PairingInfo {
  screen_id: string
  screen_name: string
  screen_type: string
  location_name: string
  code: string
  expires_at: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const screenId = params.id

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
      .eq('id', screenId)
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

    // Use service role client to generate pairing code
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

    // Generate unique pairing code
    const { data: codeResult, error: codeError } = await adminSupabase
      .rpc('generate_pairing_code')

    if (codeError || !codeResult) {
      console.error('Failed to generate pairing code:', codeError)
      return NextResponse.json({ 
        error: 'Failed to generate pairing code' 
      }, { status: 500 })
    }

    const pairingCode = codeResult

    // Store pairing code with 15 minute expiration and screen pre-assignment
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 15)

    const { data: pairing, error: pairingError } = await adminSupabase
      .from('device_pairing_codes')
      .insert({
        code: pairingCode,
        screen_id: screenId,
        device_info: {},
        device_ip: null,
        expires_at: expiresAt.toISOString(),
        created_by: user.id
      })
      .select()
      .single()

    if (pairingError) {
      console.error('Failed to store pairing code:', pairingError)
      return NextResponse.json({ 
        error: 'Failed to create pairing code' 
      }, { status: 500 })
    }

    // Create pairing information for QR code
    const pairingInfo: PairingInfo = {
      screen_id: screenId,
      screen_name: screen.name,
      screen_type: screen.screen_type,
      location_name: screen.locations?.name || 'Unknown Location',
      code: pairingCode,
      expires_at: expiresAt.toISOString()
    }

    // Create complete pairing information
    const completePairingInfo = {
      type: 'mesophy-pairing',
      version: '1.0',
      ...pairingInfo,
      dashboard_url: process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app'
    }
    
    // Generate mobile-friendly pairing URL
    const pairingUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app'}/pair?data=${encodeURIComponent(JSON.stringify(completePairingInfo))}`
    
    // Generate QR code that links to mobile pairing helper
    const qrData = pairingUrl

    let qrCodeDataUrl: string
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      })
    } catch (qrError) {
      console.error('Failed to generate QR code:', qrError)
      return NextResponse.json({ 
        error: 'Failed to generate QR code' 
      }, { status: 500 })
    }

    console.log('Screen-first pairing initiated for:', screen.name, 'with code:', pairingCode)

    return NextResponse.json({
      success: true,
      pairing: {
        ...pairingInfo,
        id: pairing.id,
        qr_code: qrCodeDataUrl,
        qr_url: pairingUrl,
        pairing_data: completePairingInfo,
        expires_in_minutes: 15,
        instructions: {
          step1: 'Install Mesophy Pi Client on your Raspberry Pi device',
          step2: 'Either scan this QR code with your phone and send to Pi, or manually enter the pairing code',
          step3: 'The device will automatically connect to this specific screen',
          manual_code: pairingCode
        }
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Screen pairing initiation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Check pairing status for a specific screen
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const screenId = params.id

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check screen status
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        device_token,
        device_status,
        last_seen,
        locations (
          id,
          name,
          districts (
            organization_id
          )
        )
      `)
      .eq('id', screenId)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ 
        error: 'Screen not found' 
      }, { status: 404 })
    }

    // Check if there are any active pairing codes for this screen
    const { data: activePairing, error: pairingError } = await supabase
      .from('device_pairing_codes')
      .select('*')
      .eq('screen_id', screenId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isPaired = !!(screen.device_id && screen.device_token)
    const hasPendingPairing = !!activePairing

    return NextResponse.json({
      screen_id: screenId,
      screen_name: screen.name,
      is_paired: isPaired,
      has_pending_pairing: hasPendingPairing,
      device_status: screen.device_status,
      last_seen: screen.last_seen,
      pending_pairing: activePairing ? {
        code: activePairing.code,
        expires_at: activePairing.expires_at,
        created_at: activePairing.created_at
      } : null
    })

  } catch (error) {
    console.error('Screen pairing status check error:', error)
    return NextResponse.json({ 
      error: 'Internal server error'
    }, { status: 500 })
  }
}