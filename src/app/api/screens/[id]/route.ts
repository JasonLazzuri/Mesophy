import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Get the screen with location and district information
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        *,
        location:locations(
          id,
          name,
          manager_id,
          district:districts(
            id,
            name,
            organization_id,
            manager_id
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check organization permission
    if (screen.location?.district?.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check role-based access
    if (profile.role === 'district_manager') {
      if (screen.location?.district?.manager_id !== user.id) {
        return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
      }
    } else if (profile.role === 'location_manager') {
      if (screen.location?.manager_id !== user.id) {
        return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
      }
    } else if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get recent device logs for this screen
    const { data: recentLogs } = await supabase
      .from('device_logs')
      .select('*')
      .eq('screen_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({ 
      screen,
      recent_logs: recentLogs || []
    })

  } catch (error) {
    console.error('Unexpected error in screen GET API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Get the existing screen to check permissions
    const { data: existingScreen, error: existingError } = await supabase
      .from('screens')
      .select(`
        *,
        location:locations(
          id,
          name,
          manager_id,
          district:districts(
            id,
            name,
            organization_id,
            manager_id
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (existingError || !existingScreen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check organization permission
    if (existingScreen.location?.district?.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check role-based access
    if (profile.role === 'district_manager') {
      if (existingScreen.location?.district?.manager_id !== user.id) {
        return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
      }
    } else if (profile.role === 'location_manager') {
      if (existingScreen.location?.manager_id !== user.id) {
        return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
      }
    } else if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { 
      name, 
      screen_type, 
      device_id, 
      device_status, 
      resolution, 
      orientation, 
      is_active, 
      ip_address, 
      firmware_version 
    } = body

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Validate and add fields if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 2 || name.length > 100) {
        return NextResponse.json({ 
          error: 'Name must be between 2 and 100 characters' 
        }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (screen_type !== undefined) {
      const validScreenTypes: ScreenType[] = ['menu_board', 'promotional', 'queue_display', 'outdoor_sign']
      if (!validScreenTypes.includes(screen_type)) {
        return NextResponse.json({ 
          error: 'Invalid screen type' 
        }, { status: 400 })
      }
      updateData.screen_type = screen_type
    }

    if (device_status !== undefined) {
      const validStatuses: DeviceStatus[] = ['online', 'offline', 'error', 'maintenance']
      if (!validStatuses.includes(device_status)) {
        return NextResponse.json({ 
          error: 'Invalid device status' 
        }, { status: 400 })
      }
      updateData.device_status = device_status
    }

    // Check device_id uniqueness if being updated
    if (device_id !== undefined && device_id !== existingScreen.device_id) {
      if (device_id) {
        const { data: duplicateScreen, error: checkError } = await supabase
          .from('screens')
          .select('id')
          .eq('device_id', device_id)
          .neq('id', params.id)
          .single()

        if (checkError && checkError.code !== 'PGRST116') {
          console.error('Error checking device_id uniqueness:', checkError)
          return NextResponse.json({ error: 'Failed to validate device ID' }, { status: 500 })
        }

        if (duplicateScreen) {
          return NextResponse.json({ 
            error: 'Device ID already exists. Each device must have a unique ID.' 
          }, { status: 409 })
        }
      }
      updateData.device_id = device_id?.trim() || null
    }

    if (resolution !== undefined) {
      const resolutionPattern = /^\d{3,4}x\d{3,4}$/
      if (!resolutionPattern.test(resolution)) {
        return NextResponse.json({ 
          error: 'Resolution must be in format like 1920x1080' 
        }, { status: 400 })
      }
      updateData.resolution = resolution
    }

    if (orientation !== undefined) {
      const validOrientations: Orientation[] = ['landscape', 'portrait']
      if (!validOrientations.includes(orientation)) {
        return NextResponse.json({ 
          error: 'Invalid orientation' 
        }, { status: 400 })
      }
      updateData.orientation = orientation
    }

    if (is_active !== undefined) {
      updateData.is_active = Boolean(is_active)
    }

    if (ip_address !== undefined) {
      updateData.ip_address = ip_address?.trim() || null
    }

    if (firmware_version !== undefined) {
      updateData.firmware_version = firmware_version?.trim() || null
    }

    // Update the screen
    const { data: screen, error: updateError } = await supabase
      .from('screens')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        location:locations(
          id,
          name,
          district:districts(
            id,
            name
          )
        )
      `)
      .single()

    if (updateError) {
      console.error('Error updating screen:', updateError)
      
      // Handle duplicate name error within location
      if (updateError.code === '23505') {
        return NextResponse.json({ 
          error: 'A screen with this name already exists in this location' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to update screen' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Screen updated successfully',
      screen 
    })

  } catch (error) {
    console.error('Unexpected error in screen PUT API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Only super_admin and district_manager can delete screens
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Get the screen to check permissions and dependencies
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        *,
        location:locations(
          id,
          name,
          manager_id,
          district:districts(
            id,
            name,
            organization_id,
            manager_id
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check organization permission
    if (screen.location?.district?.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Check role-based access
    if (profile.role === 'district_manager') {
      if (screen.location?.district?.manager_id !== user.id) {
        return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
      }
    }

    // Check for dependencies (schedules)
    const { data: schedules, error: scheduleError } = await supabase
      .from('schedules')
      .select('id, name')
      .eq('screen_id', params.id)
      .limit(1)

    if (scheduleError) {
      console.error('Error checking schedule dependencies:', scheduleError)
      return NextResponse.json({ error: 'Failed to check dependencies' }, { status: 500 })
    }

    if (schedules && schedules.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete screen with active schedules. Please remove all schedules first.' 
      }, { status: 409 })
    }

    // Delete device logs first (cascade)
    const { error: logsDeleteError } = await supabase
      .from('device_logs')
      .delete()
      .eq('screen_id', params.id)

    if (logsDeleteError) {
      console.error('Error deleting device logs:', logsDeleteError)
      // Continue with screen deletion even if logs deletion fails
    }

    // Delete the screen
    const { error: deleteError } = await supabase
      .from('screens')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('Error deleting screen:', deleteError)
      return NextResponse.json({ 
        error: 'Failed to delete screen' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Screen deleted successfully'
    })

  } catch (error) {
    console.error('Unexpected error in screen DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}