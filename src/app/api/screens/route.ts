import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'

export async function GET(request: NextRequest) {
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

    // Get user profile to check permissions and organization
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

    // Parse query parameters for filtering
    const { searchParams } = new URL(request.url)
    const locationFilter = searchParams.get('location_id')
    const statusFilter = searchParams.get('status')
    const typeFilter = searchParams.get('type')
    const search = searchParams.get('search')

    // Build base query with joins
    let query = supabase
      .from('screens')
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

    // Apply role-based filtering
    if (profile.role === 'super_admin') {
      // Super admin can see all screens in their organization
      const { data: orgDistricts } = await supabase
        .from('districts')
        .select('id')
        .eq('organization_id', profile.organization_id)
      
      const districtIds = orgDistricts?.map(d => d.id) || []
      if (districtIds.length > 0) {
        // Get locations for these districts
        const { data: orgLocations } = await supabase
          .from('locations')
          .select('id')
          .in('district_id', districtIds)
        
        const locationIds = orgLocations?.map(l => l.id) || []
        if (locationIds.length > 0) {
          query = query.in('location_id', locationIds)
        } else {
          return NextResponse.json({ screens: [] })
        }
      } else {
        return NextResponse.json({ screens: [] })
      }
    } else if (profile.role === 'district_manager') {
      // District manager can only see screens in districts they manage
      const { data: managedDistricts } = await supabase
        .from('districts')
        .select('id')
        .eq('manager_id', user.id)
        .eq('organization_id', profile.organization_id)
      
      const districtIds = managedDistricts?.map(d => d.id) || []
      if (districtIds.length > 0) {
        // Get locations for managed districts
        const { data: districtLocations } = await supabase
          .from('locations')
          .select('id')
          .in('district_id', districtIds)
        
        const locationIds = districtLocations?.map(l => l.id) || []
        if (locationIds.length > 0) {
          query = query.in('location_id', locationIds)
        } else {
          return NextResponse.json({ screens: [] })
        }
      } else {
        return NextResponse.json({ screens: [] })
      }
    } else if (profile.role === 'location_manager') {
      // Location manager can only see screens in their location
      const { data: managedLocations } = await supabase
        .from('locations')
        .select('id')
        .eq('manager_id', user.id)
      
      const locationIds = managedLocations?.map(l => l.id) || []
      if (locationIds.length > 0) {
        query = query.in('location_id', locationIds)
      } else {
        return NextResponse.json({ screens: [] })
      }
    } else {
      // Other roles have no access
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Apply additional filters
    if (locationFilter) {
      query = query.eq('location_id', locationFilter)
    }

    if (statusFilter) {
      query = query.eq('device_status', statusFilter)
    }

    if (typeFilter) {
      query = query.eq('screen_type', typeFilter)
    }

    // Execute query
    const { data: screens, error: screensError } = await query.order('name')

    if (screensError) {
      console.error('Error fetching screens:', screensError)
      return NextResponse.json({ error: 'Failed to fetch screens' }, { status: 500 })
    }

    // Apply search filter if provided (done client-side for complex joins)
    let filteredScreens = screens || []
    if (search) {
      const searchLower = search.toLowerCase()
      filteredScreens = filteredScreens.filter(screen => 
        screen.name.toLowerCase().includes(searchLower) ||
        screen.device_id?.toLowerCase().includes(searchLower) ||
        screen.location?.name.toLowerCase().includes(searchLower) ||
        screen.location?.district?.name.toLowerCase().includes(searchLower)
      )
    }

    return NextResponse.json({ screens: filteredScreens })

  } catch (error) {
    console.error('Unexpected error in screens API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    // Check if user has permission to create screens
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager' && profile.role !== 'location_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { 
      location_id, 
      name, 
      screen_type, 
      device_id, 
      resolution, 
      orientation, 
      ip_address, 
      firmware_version 
    } = body

    // Validate required fields
    if (!location_id || !name || !screen_type) {
      return NextResponse.json({ 
        error: 'Location, name, and screen type are required' 
      }, { status: 400 })
    }

    // Validate field lengths and formats
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ 
        error: 'Name must be between 2 and 100 characters' 
      }, { status: 400 })
    }

    // Validate screen type
    const validScreenTypes: ScreenType[] = ['menu_board', 'promotional', 'queue_display', 'outdoor_sign']
    if (!validScreenTypes.includes(screen_type)) {
      return NextResponse.json({ 
        error: 'Invalid screen type' 
      }, { status: 400 })
    }

    // Validate orientation
    const validOrientations: Orientation[] = ['landscape', 'portrait']
    const screenOrientation = orientation || 'landscape'
    if (!validOrientations.includes(screenOrientation)) {
      return NextResponse.json({ 
        error: 'Invalid orientation' 
      }, { status: 400 })
    }

    // Validate resolution format
    const screenResolution = resolution || '1920x1080'
    const resolutionPattern = /^\d{3,4}x\d{3,4}$/
    if (!resolutionPattern.test(screenResolution)) {
      return NextResponse.json({ 
        error: 'Resolution must be in format like 1920x1080' 
      }, { status: 400 })
    }

    // Validate device_id uniqueness if provided
    if (device_id) {
      const { data: existingScreen, error: checkError } = await supabase
        .from('screens')
        .select('id')
        .eq('device_id', device_id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking device_id uniqueness:', checkError)
        return NextResponse.json({ error: 'Failed to validate device ID' }, { status: 500 })
      }

      if (existingScreen) {
        return NextResponse.json({ 
          error: 'Device ID already exists. Each device must have a unique ID.' 
        }, { status: 409 })
      }
    }

    // Verify the location exists and user has permission to add screens to it
    const locationQuery = supabase
      .from('locations')
      .select(`
        id, 
        name, 
        district_id,
        manager_id,
        district:districts(
          id, 
          name, 
          organization_id, 
          manager_id
        )
      `)
      .eq('id', location_id)
      .single()

    const { data: location, error: locationError } = await locationQuery

    if (locationError || !location) {
      return NextResponse.json({ 
        error: 'Invalid location selected' 
      }, { status: 400 })
    }

    // Check organization permission
    if (location.district?.organization_id !== profile.organization_id) {
      return NextResponse.json({ 
        error: 'Location does not belong to your organization' 
      }, { status: 403 })
    }

    // Check role-based location access
    if (profile.role === 'district_manager' && location.district?.manager_id !== user.id) {
      return NextResponse.json({ 
        error: 'You can only add screens to locations in districts you manage' 
      }, { status: 403 })
    } else if (profile.role === 'location_manager' && location.manager_id !== user.id) {
      return NextResponse.json({ 
        error: 'You can only add screens to locations you manage' 
      }, { status: 403 })
    }

    // Create the screen
    const { data: screen, error: createError } = await supabase
      .from('screens')
      .insert({
        location_id,
        name: name.trim(),
        screen_type,
        device_id: device_id?.trim() || null,
        device_status: 'offline' as DeviceStatus,
        resolution: screenResolution,
        orientation: screenOrientation,
        is_active: true,
        ip_address: ip_address?.trim() || null,
        firmware_version: firmware_version?.trim() || null,
        last_heartbeat: null
      })
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

    if (createError) {
      console.error('Error creating screen:', createError)
      
      // Handle duplicate name error within location
      if (createError.code === '23505') {
        return NextResponse.json({ 
          error: 'A screen with this name already exists in this location' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create screen' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Screen created successfully',
      screen 
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in screens POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}