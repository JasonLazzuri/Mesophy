import { NextRequest, NextResponse } from 'next/server'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('GET /api/screens/[id] - Starting request for ID:', params.id)
    
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('GET /api/screens/[id] - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Get the screen using REST API
    console.log('GET /api/screens/[id] - Fetching screen data')
    const screenResponse = await fetch(`${url}/rest/v1/screens?id=eq.${params.id}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!screenResponse.ok) {
      console.error('GET /api/screens/[id] - Screen fetch failed:', screenResponse.status, screenResponse.statusText)
      return NextResponse.json({ error: 'Failed to fetch screen' }, { status: 500 })
    }

    const screens = await screenResponse.json()
    console.log('GET /api/screens/[id] - Screen data:', screens)

    if (!screens || screens.length === 0) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    const screen = screens[0]

    // Get location info
    const locationResponse = await fetch(`${url}/rest/v1/locations?id=eq.${screen.location_id}&select=id,name,manager_id,district_id`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!locationResponse.ok) {
      console.error('GET /api/screens/[id] - Location fetch failed:', locationResponse.status)
      return NextResponse.json({ error: 'Screen location not found' }, { status: 404 })
    }

    const locations = await locationResponse.json()
    if (!locations || locations.length === 0) {
      return NextResponse.json({ error: 'Screen location not found' }, { status: 404 })
    }

    const location = locations[0]

    // Get district info
    const districtResponse = await fetch(`${url}/rest/v1/districts?id=eq.${location.district_id}&select=id,name,organization_id,manager_id`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!districtResponse.ok) {
      console.error('GET /api/screens/[id] - District fetch failed:', districtResponse.status)
      return NextResponse.json({ error: 'Screen district not found' }, { status: 404 })
    }

    const districts = await districtResponse.json()
    if (!districts || districts.length === 0) {
      return NextResponse.json({ error: 'Screen district not found' }, { status: 404 })
    }

    const district = districts[0]

    // Get recent device logs for this screen
    const logsResponse = await fetch(`${url}/rest/v1/device_logs?screen_id=eq.${params.id}&order=created_at.desc&limit=10`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    let recentLogs = []
    if (logsResponse.ok) {
      recentLogs = await logsResponse.json()
    }

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
    console.log('PUT /api/screens/[id] - Starting request for ID:', params.id)
    
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('PUT /api/screens/[id] - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
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
      is_active
    } = body

    console.log('PUT /api/screens/[id] - Update data:', body)

    // Get the existing screen to check permissions
    const screenResponse = await fetch(`${url}/rest/v1/screens?id=eq.${params.id}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!screenResponse.ok) {
      console.error('PUT /api/screens/[id] - Screen fetch failed:', screenResponse.status)
      return NextResponse.json({ error: 'Failed to fetch screen' }, { status: 500 })
    }

    const screens = await screenResponse.json()
    if (!screens || screens.length === 0) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    const existingScreen = screens[0]

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
      const validScreenTypes: ScreenType[] = ['ad_device', 'menu_board', 'employee_board']
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
        const duplicateResponse = await fetch(`${url}/rest/v1/screens?device_id=eq.${device_id}&id=neq.${params.id}&select=id`, {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          }
        })

        if (duplicateResponse.ok) {
          const duplicates = await duplicateResponse.json()
          if (duplicates && duplicates.length > 0) {
            return NextResponse.json({ 
              error: 'Device ID already exists. Each device must have a unique ID.' 
            }, { status: 409 })
          }
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

    console.log('PUT /api/screens/[id] - Final update data:', updateData)

    // Update the screen using REST API
    const updateResponse = await fetch(`${url}/rest/v1/screens?id=eq.${params.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updateData)
    })

    if (!updateResponse.ok) {
      console.error('PUT /api/screens/[id] - Update failed:', updateResponse.status, updateResponse.statusText)
      const errorText = await updateResponse.text()
      console.error('PUT /api/screens/[id] - Error details:', errorText)
      
      // Handle duplicate name error within location
      if (updateResponse.status === 409 || errorText.includes('23505')) {
        return NextResponse.json({ 
          error: 'A screen with this name already exists in this location' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to update screen' 
      }, { status: 500 })
    }

    const updatedScreens = await updateResponse.json()
    console.log('PUT /api/screens/[id] - Update successful:', updatedScreens)

    const screen = updatedScreens && updatedScreens.length > 0 ? updatedScreens[0] : updateData

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
    console.log('DELETE /api/screens/[id] - Starting request for ID:', params.id)
    
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('DELETE /api/screens/[id] - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Get the screen to check permissions and dependencies
    console.log('DELETE /api/screens/[id] - Fetching screen data')
    const screenResponse = await fetch(`${url}/rest/v1/screens?id=eq.${params.id}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!screenResponse.ok) {
      console.error('DELETE /api/screens/[id] - Screen fetch failed:', screenResponse.status)
      return NextResponse.json({ error: 'Failed to fetch screen' }, { status: 500 })
    }

    const screens = await screenResponse.json()
    console.log('DELETE /api/screens/[id] - Screen data:', screens)

    if (!screens || screens.length === 0) {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    const screen = screens[0]

    // Check for dependencies (schedules)
    console.log('DELETE /api/screens/[id] - Checking for schedule dependencies')
    const schedulesResponse = await fetch(`${url}/rest/v1/schedules?screen_id=eq.${params.id}&select=id,name&limit=1`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (schedulesResponse.ok) {
      const schedules = await schedulesResponse.json()
      console.log('DELETE /api/screens/[id] - Schedules found:', schedules)
      
      if (schedules && schedules.length > 0) {
        return NextResponse.json({ 
          error: 'Cannot delete screen with active schedules. Please remove all schedules first.' 
        }, { status: 409 })
      }
    } else {
      console.error('DELETE /api/screens/[id] - Failed to check schedule dependencies:', schedulesResponse.status)
      return NextResponse.json({ error: 'Failed to check dependencies' }, { status: 500 })
    }

    // Delete device logs first (cascade)
    console.log('DELETE /api/screens/[id] - Deleting device logs')
    const logsDeleteResponse = await fetch(`${url}/rest/v1/device_logs?screen_id=eq.${params.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!logsDeleteResponse.ok) {
      console.error('DELETE /api/screens/[id] - Device logs deletion failed:', logsDeleteResponse.status)
      // Continue with screen deletion even if logs deletion fails
    } else {
      console.log('DELETE /api/screens/[id] - Device logs deleted successfully')
    }

    // Delete the screen
    console.log('DELETE /api/screens/[id] - Deleting screen')
    const deleteResponse = await fetch(`${url}/rest/v1/screens?id=eq.${params.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!deleteResponse.ok) {
      console.error('DELETE /api/screens/[id] - Screen deletion failed:', deleteResponse.status, deleteResponse.statusText)
      const errorText = await deleteResponse.text()
      console.error('DELETE /api/screens/[id] - Delete error details:', errorText)
      return NextResponse.json({ 
        error: 'Failed to delete screen' 
      }, { status: 500 })
    }

    console.log('DELETE /api/screens/[id] - Screen deleted successfully')
    return NextResponse.json({ 
      message: 'Screen deleted successfully'
    })

  } catch (error) {
    console.error('Unexpected error in screen DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}