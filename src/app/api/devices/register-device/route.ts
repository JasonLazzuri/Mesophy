import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface RegisterDeviceRequest {
  device_id: string
  screen_id?: string
  force?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body: RegisterDeviceRequest = await request.json()
    
    const { device_id, screen_id, force = false } = body

    if (!device_id) {
      return NextResponse.json({ 
        error: 'device_id is required' 
      }, { status: 400 })
    }

    console.log(`Device registration request: ${device_id} -> screen ${screen_id}`)

    // If screen_id is provided, update that specific screen
    if (screen_id) {
      const { data: screen, error: screenError } = await supabase
        .from('screens')
        .select('id, name, device_id')
        .eq('id', screen_id)
        .single()

      if (screenError || !screen) {
        return NextResponse.json({ 
          error: 'Screen not found' 
        }, { status: 404 })
      }

      // Check if screen already has a different device_id
      if (screen.device_id && screen.device_id !== device_id && !force) {
        return NextResponse.json({ 
          error: 'Screen already assigned to different device',
          current_device_id: screen.device_id,
          message: 'Use force=true to override'
        }, { status: 409 })
      }

      // Update the screen with the device_id
      const { error: updateError } = await supabase
        .from('screens')
        .update({ device_id: device_id })
        .eq('id', screen_id)

      if (updateError) {
        console.error('Failed to update screen:', updateError)
        return NextResponse.json({ 
          error: 'Failed to update screen' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Device registered successfully',
        device_id,
        screen_id,
        screen_name: screen.name
      })
    }

    // If no screen_id provided, find unassigned screens or show current status
    const { data: unassignedScreens, error: unassignedError } = await supabase
      .from('screens')
      .select(`
        id, 
        name, 
        device_id,
        locations!inner (name)
      `)
      .or('device_id.is.null,device_id.eq.')
      .limit(10)

    const { data: currentAssignment, error: currentError } = await supabase
      .from('screens')
      .select(`
        id, 
        name,
        locations!inner (name)
      `)
      .eq('device_id', device_id)
      .single()

    return NextResponse.json({
      success: true,
      device_id,
      current_assignment: currentAssignment || null,
      unassigned_screens: unassignedScreens || [],
      message: currentAssignment 
        ? `Device is registered to screen: ${currentAssignment.name}`
        : 'Device not registered. Available unassigned screens listed.'
    })

  } catch (error) {
    console.error('Device registration error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const device_id = searchParams.get('device_id')

  if (!device_id) {
    return NextResponse.json({ 
      error: 'device_id parameter is required' 
    }, { status: 400 })
  }

  try {
    // Use admin client for device operations to bypass RLS
    const supabase = createAdminClient()
    if (!supabase) {
      console.error('Failed to create admin client for device lookup')
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }
    
    // Check current assignment
    const { data: currentAssignment, error: currentError } = await supabase
      .from('screens')
      .select(`
        id, 
        name,
        device_status,
        last_seen,
        locations!inner (
          name,
          districts (name)
        )
      `)
      .eq('device_id', device_id)
      .single()

    return NextResponse.json({
      success: true,
      device_id,
      is_registered: !!currentAssignment,
      assignment: currentAssignment || null
    })

  } catch (error) {
    console.error('Device lookup error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}