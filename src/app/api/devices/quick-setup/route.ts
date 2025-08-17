import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface QuickSetupRequest {
  device_id: string
  screen_name: string
  location_name?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body: QuickSetupRequest = await request.json()
    
    const { device_id, screen_name, location_name = "Kenmore Location" } = body

    if (!device_id || !screen_name) {
      return NextResponse.json({ 
        error: 'device_id and screen_name are required' 
      }, { status: 400 })
    }

    console.log(`Quick setup: Creating screen "${screen_name}" for device ${device_id}`)

    // First, find or create a location
    let location_id = null
    
    const { data: existingLocation } = await supabase
      .from('locations')
      .select('id')
      .eq('name', location_name)
      .single()

    if (existingLocation) {
      location_id = existingLocation.id
    } else {
      // Create a basic location (this is a quick setup, so we'll use minimal data)
      const { data: newLocation, error: locationError } = await supabase
        .from('locations')
        .insert({
          name: location_name,
          address: "Test Address",
          is_active: true,
          organization_id: "00000000-0000-0000-0000-000000000001" // Default org
        })
        .select('id')
        .single()

      if (locationError) {
        console.error('Failed to create location:', locationError)
        return NextResponse.json({ 
          error: 'Failed to create location',
          details: locationError.message
        }, { status: 500 })
      }

      location_id = newLocation.id
    }

    // Create the screen
    const { data: newScreen, error: screenError } = await supabase
      .from('screens')
      .insert({
        name: screen_name,
        location_id: location_id,
        screen_type: 'employee_board',
        device_id: device_id,
        device_status: 'online',
        resolution: '1920x1080',
        orientation: 'landscape',
        is_active: true
      })
      .select('id, name')
      .single()

    if (screenError) {
      console.error('Failed to create screen:', screenError)
      return NextResponse.json({ 
        error: 'Failed to create screen',
        details: screenError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Screen created and device registered successfully',
      screen: {
        id: newScreen.id,
        name: newScreen.name,
        device_id: device_id
      },
      location: {
        id: location_id,
        name: location_name
      }
    })

  } catch (error) {
    console.error('Quick setup error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}