import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'
import { validateUserAuth, hasRequiredRole, hasOrganizationAccess } from '@/lib/auth-helper'

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

    // Build base query (simplified to avoid relationship issues)
    let query = supabase
      .from('screens')
      .select('*')

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

    // Apply search filter if provided (simplified without relationship data)
    let filteredScreens = screens || []
    if (search) {
      const searchLower = search.toLowerCase()
      filteredScreens = filteredScreens.filter(screen => 
        screen.name.toLowerCase().includes(searchLower) ||
        screen.device_id?.toLowerCase().includes(searchLower)
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
    console.log('POST /api/screens - Starting request with REST API authentication')
    
    // Use REST API authentication instead of Supabase JavaScript client
    const { user, profile, error: authError } = await validateUserAuth(request)
    
    if (authError || !user || !profile) {
      console.error('POST /api/screens - Authentication failed:', authError)
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: authError || 'Authentication validation failed'
      }, { status: 401 })
    }
    
    console.log('POST /api/screens - User authenticated via REST API:', { 
      userId: user.id, 
      role: profile.role, 
      org: profile.organization_id 
    })

    // Check if user has permission to create screens
    const allowedRoles = ['super_admin', 'district_manager', 'location_manager']
    if (!hasRequiredRole(profile, allowedRoles)) {
      console.error('POST /api/screens - Insufficient permissions for role:', profile.role)
      return NextResponse.json({ 
        error: 'Insufficient permissions',
        details: `Role ${profile.role} cannot create screens`
      }, { status: 403 })
    }

    if (!hasOrganizationAccess(profile)) {
      console.error('POST /api/screens - No organization access')
      return NextResponse.json({ 
        error: 'No organization associated with user',
        details: 'User profile missing organization_id'
      }, { status: 403 })
    }
    
    // Create Supabase client for database operations (not auth)
    const supabase = await createClient()
    if (!supabase) {
      console.error('POST /api/screens - Supabase client not available for database operations')
      return NextResponse.json({ 
        error: 'Database unavailable',
        details: 'Supabase client initialization failed'
      }, { status: 503 })
    }

    // Parse request body
    console.log('POST /api/screens - Parsing request body')
    const body = await request.json()
    console.log('POST /api/screens - Request body:', body)
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
    console.log('POST /api/screens - Validating required fields')
    if (!location_id || !name || !screen_type) {
      console.error('POST /api/screens - Missing required fields:', { location_id, name, screen_type })
      return NextResponse.json({ 
        error: 'Location, name, and screen type are required',
        details: `Missing: ${!location_id ? 'location_id ' : ''}${!name ? 'name ' : ''}${!screen_type ? 'screen_type' : ''}`
      }, { status: 400 })
    }

    // Validate field lengths and formats
    console.log('POST /api/screens - Validating field lengths')
    if (name.length < 2 || name.length > 100) {
      console.error('POST /api/screens - Invalid name length:', name.length)
      return NextResponse.json({ 
        error: 'Name must be between 2 and 100 characters',
        details: `Name length: ${name.length}`
      }, { status: 400 })
    }

    // Validate screen type
    console.log('POST /api/screens - Validating screen type')
    const validScreenTypes: ScreenType[] = ['menu_board', 'promotional', 'queue_display', 'outdoor_sign']
    if (!validScreenTypes.includes(screen_type)) {
      console.error('POST /api/screens - Invalid screen type:', screen_type)
      return NextResponse.json({ 
        error: 'Invalid screen type',
        details: `Valid types: ${validScreenTypes.join(', ')}`
      }, { status: 400 })
    }

    // Validate orientation
    console.log('POST /api/screens - Validating orientation')
    const validOrientations: Orientation[] = ['landscape', 'portrait']
    const screenOrientation = orientation || 'landscape'
    if (!validOrientations.includes(screenOrientation)) {
      console.error('POST /api/screens - Invalid orientation:', screenOrientation)
      return NextResponse.json({ 
        error: 'Invalid orientation',
        details: `Valid orientations: ${validOrientations.join(', ')}`
      }, { status: 400 })
    }

    // Validate resolution format
    console.log('POST /api/screens - Validating resolution format')
    const screenResolution = resolution || '1920x1080'
    const resolutionPattern = /^\d{3,4}x\d{3,4}$/
    if (!resolutionPattern.test(screenResolution)) {
      console.error('POST /api/screens - Invalid resolution format:', screenResolution)
      return NextResponse.json({ 
        error: 'Resolution must be in format like 1920x1080',
        details: `Provided: ${screenResolution}`
      }, { status: 400 })
    }

    // Validate device_id uniqueness if provided
    if (device_id) {
      console.log('POST /api/screens - Checking device_id uniqueness:', device_id)
      const { data: existingScreen, error: checkError } = await supabase
        .from('screens')
        .select('id')
        .eq('device_id', device_id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('POST /api/screens - Error checking device_id uniqueness:', checkError)
        return NextResponse.json({ 
          error: 'Failed to validate device ID',
          details: checkError.message
        }, { status: 500 })
      }

      if (existingScreen) {
        console.error('POST /api/screens - Device ID already exists:', device_id)
        return NextResponse.json({ 
          error: 'Device ID already exists. Each device must have a unique ID.',
          details: `Device ID ${device_id} is already in use`
        }, { status: 409 })
      }
    }

    // Verify the location exists and user has permission to add screens to it
    console.log('POST /api/screens - Verifying location exists:', location_id)
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id, name, district_id, manager_id')
      .eq('id', location_id)
      .single()

    if (locationError || !location) {
      console.error('POST /api/screens - Location error:', locationError)
      return NextResponse.json({ 
        error: 'Invalid location selected',
        details: locationError?.message || 'Location not found'
      }, { status: 400 })
    }
    console.log('POST /api/screens - Location found:', { id: location.id, name: location.name, district_id: location.district_id })

    // Get district info separately to avoid relationship issues
    console.log('POST /api/screens - Getting district info:', location.district_id)
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('id, name, organization_id, manager_id')
      .eq('id', location.district_id)
      .single()

    if (districtError || !district) {
      console.error('POST /api/screens - District error:', districtError)
      return NextResponse.json({ 
        error: 'Invalid district for selected location',
        details: districtError?.message || 'District not found'
      }, { status: 400 })
    }
    console.log('POST /api/screens - District found:', { id: district.id, name: district.name, org_id: district.organization_id })

    // Check organization permission
    console.log('POST /api/screens - Checking organization permission')
    if (district.organization_id !== profile.organization_id) {
      console.error('POST /api/screens - Organization mismatch:', { 
        district_org: district.organization_id, 
        user_org: profile.organization_id 
      })
      return NextResponse.json({ 
        error: 'Location does not belong to your organization',
        details: `District org: ${district.organization_id}, User org: ${profile.organization_id}`
      }, { status: 403 })
    }

    // Check role-based location access
    console.log('POST /api/screens - Checking role-based permissions')
    if (profile.role === 'district_manager' && district.manager_id !== user.id) {
      console.error('POST /api/screens - District manager permission denied:', {
        district_manager: district.manager_id,
        user_id: user.id
      })
      return NextResponse.json({ 
        error: 'You can only add screens to locations in districts you manage',
        details: `District manager: ${district.manager_id}, User: ${user.id}`
      }, { status: 403 })
    } else if (profile.role === 'location_manager' && location.manager_id !== user.id) {
      console.error('POST /api/screens - Location manager permission denied:', {
        location_manager: location.manager_id,
        user_id: user.id
      })
      return NextResponse.json({ 
        error: 'You can only add screens to locations you manage',
        details: `Location manager: ${location.manager_id}, User: ${user.id}`
      }, { status: 403 })
    }

    // Create the screen
    console.log('POST /api/screens - Creating screen with data:', {
      location_id,
      name: name.trim(),
      screen_type,
      device_id: device_id?.trim() || null,
      resolution: screenResolution,
      orientation: screenOrientation
    })
    
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
      .select('*')
      .single()

    if (createError) {
      console.error('POST /api/screens - Error creating screen:', createError)
      console.error('POST /api/screens - Full error details:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint
      })
      
      // Handle duplicate name error within location
      if (createError.code === '23505') {
        return NextResponse.json({ 
          error: 'A screen with this name already exists in this location',
          details: createError.message
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create screen',
        details: createError.message,
        code: createError.code,
        hint: createError.hint
      }, { status: 500 })
    }

    console.log('POST /api/screens - Screen created successfully:', screen.id)

    return NextResponse.json({ 
      message: 'Screen created successfully',
      screen 
    }, { status: 201 })

  } catch (error) {
    console.error('POST /api/screens - Unexpected error:', error)
    console.error('POST /api/screens - Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: 'unexpected_error'
    }, { status: 500 })
  }
}