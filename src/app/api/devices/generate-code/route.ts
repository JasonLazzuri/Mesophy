import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { 
      device_info = {},
      device_ip = null
    } = body

    console.log('Pi device requesting pairing code:', { device_info, device_ip })

    // Use service role client to bypass RLS for code generation
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing service key for device operations')
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
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

    // Store pairing code with 15 minute expiration
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 15)

    const { data: pairing, error: pairingError } = await adminSupabase
      .from('device_pairing_codes')
      .insert({
        code: pairingCode,
        device_info: device_info || {},
        device_ip,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (pairingError) {
      console.error('Failed to store pairing code:', pairingError)
      return NextResponse.json({ 
        error: 'Failed to create pairing code' 
      }, { status: 500 })
    }

    console.log('Pairing code generated successfully:', pairingCode)

    // Return pairing code and instructions
    return NextResponse.json({
      success: true,
      pairing_code: pairingCode,
      expires_at: expiresAt.toISOString(),
      expires_in_minutes: 15,
      instructions: {
        step1: 'Go to your Mesophy dashboard',
        step2: 'Navigate to Screens > Pair Device',
        step3: `Enter code: ${pairingCode}`,
        step4: 'Select the screen for this device'
      },
      check_pairing_url: `/api/devices/check-pairing/${pairingCode}`,
      dashboard_url: process.env.NEXT_PUBLIC_SITE_URL || 'https://mesophy.vercel.app'
    }, { status: 201 })

  } catch (error) {
    console.error('Generate pairing code error:', error)
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}