import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const deviceId = 'pi-183e6ed8-me7zrqxx'

    // First, let's check the screen data for this device
    console.log('Checking screen data for device:', deviceId)
    
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        location_id,
        locations!inner (
          id,
          name,
          district_id,
          districts!inner (
            id,
            name,
            organization_id
          )
        )
      `)
      .eq('device_id', deviceId)
      .single()

    console.log('Screen query result:', { screen, screenError })

    if (screenError || !screen) {
      return NextResponse.json({ 
        error: 'Screen not found',
        details: screenError?.message,
        deviceId,
        debug: 'Device may not be properly associated with a screen'
      })
    }

    // Try to insert a test command
    console.log('Attempting test command insert...')
    
    const testCommand = {
      device_id: deviceId,
      screen_id: screen.id,
      command_type: 'health_check',
      command_data: { source: 'debug_test' },
      priority: 5,
      timeout_seconds: 300,
      scheduled_for: new Date().toISOString(),
      created_by: '17be5a31-f0c6-4094-b4ca-96ee3509bcf1' // Your user ID
    }

    console.log('Test command data:', testCommand)

    const { data: command, error: insertError } = await supabase
      .from('device_commands')
      .insert(testCommand)
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({
        error: 'Failed to insert test command',
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        testCommand
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Test command inserted successfully',
      screen: {
        id: screen.id,
        name: screen.name,
        device_id: screen.device_id,
        location: screen.locations
      },
      command: {
        id: command.id,
        command_type: command.command_type,
        status: command.status,
        created_at: command.created_at
      }
    })

  } catch (error) {
    console.error('Debug test error:', error)
    return NextResponse.json({
      error: 'Debug test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}