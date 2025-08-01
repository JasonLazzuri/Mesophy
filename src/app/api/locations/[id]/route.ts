import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
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

    // Fetch the specific location (simple query without relationships)
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (locationError) {
      if (locationError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      console.error('Error fetching location:', locationError)
      return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 })
    }

    // Fetch district info separately
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('id, name, organization_id, manager_id')
      .eq('id', location.district_id)
      .single()

    if (districtError || !district) {
      return NextResponse.json({ error: 'Location district not found' }, { status: 404 })
    }

    // Check organization permission
    if (district.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based access control
    if (profile.role === 'district_manager') {
      // District manager can only view locations in districts they manage
      if (district.manager_id !== user.id) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
    } else if (profile.role === 'location_manager') {
      // Location manager can only view their own location
      if (location.manager_id !== user.id) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
    } else if (profile.role !== 'super_admin') {
      // Other roles have no access
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Fetch manager info if there is one
    let manager = null
    if (location.manager_id) {
      const { data: managerData } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', location.manager_id)
        .single()
      
      if (managerData) {
        manager = managerData
      }
    }

    return NextResponse.json({ 
      location: {
        ...location,
        district,
        manager
      }
    })

  } catch (error) {
    console.error('Unexpected error in location GET API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  console.log(`[PUT /api/locations/${params.id}] Starting location update request`)
  
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('[PUT] Database client unavailable')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[PUT] Authentication failed:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log(`[PUT] User authenticated: ${user.id}`)

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check if user has permission to update locations
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager' && profile.role !== 'location_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('[PUT] Failed to parse request body:', parseError)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    
    const { district_id, name, address, phone, timezone, is_active } = body
    console.log(`[PUT] Request data:`, { district_id, name, address, phone, timezone, is_active })

    // Validate required fields
    if (!district_id || !name || !address) {
      console.error('[PUT] Validation failed - missing required fields:', { district_id: !!district_id, name: !!name, address: !!address })
      return NextResponse.json({ 
        error: 'District, name, and address are required' 
      }, { status: 400 })
    }

    // Validate field lengths
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      console.error('[PUT] Name validation failed:', { name, length: name?.length })
      return NextResponse.json({ 
        error: 'Name must be between 2 and 100 characters' 
      }, { status: 400 })
    }

    if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 500) {
      console.error('[PUT] Address validation failed:', { address, length: address?.length })
      return NextResponse.json({ 
        error: 'Address must be between 5 and 500 characters' 
      }, { status: 400 })
    }

    // Validate phone number if provided
    if (phone && (typeof phone !== 'string' || phone.trim().length < 10 || phone.trim().length > 20)) {
      console.error('[PUT] Phone validation failed:', { phone, length: phone?.length })
      return NextResponse.json({ 
        error: 'Phone number must be between 10 and 20 characters' 
      }, { status: 400 })
    }

    // Validate timezone if provided
    const validTimezones = [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
      'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
      'Europe/Berlin', 'Europe/Rome', 'Asia/Tokyo', 'Asia/Shanghai',
      'Australia/Sydney', 'Australia/Melbourne'
    ]
    
    const locationTimezone = timezone || 'America/New_York'
    if (!validTimezones.includes(locationTimezone)) {
      return NextResponse.json({ 
        error: 'Invalid timezone selected' 
      }, { status: 400 })
    }

    // Get the current location to check permissions (simple query without relationships)
    console.log(`[PUT] Fetching current location data for ID: ${params.id}`)
    const { data: currentLocation, error: currentLocationError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (currentLocationError || !currentLocation) {
      console.error('[PUT] Failed to fetch current location:', currentLocationError)
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }
    
    console.log(`[PUT] Current location found:`, { id: currentLocation.id, name: currentLocation.name, district_id: currentLocation.district_id })

    // Fetch current district info separately
    const { data: currentDistrict, error: currentDistrictError } = await supabase
      .from('districts')
      .select('id, name, organization_id, manager_id')
      .eq('id', currentLocation.district_id)
      .single()

    if (currentDistrictError || !currentDistrict) {
      return NextResponse.json({ error: 'Location district not found' }, { status: 404 })
    }

    // Check organization permission
    if (currentDistrict.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based permission checks
    if (profile.role === 'district_manager') {
      // District manager can only update locations in districts they manage
      if (currentDistrict.manager_id !== user.id) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    } else if (profile.role === 'location_manager') {
      // Location manager can only update their own location
      if (currentLocation.manager_id !== user.id) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      // Location managers cannot change district
      if (district_id !== currentLocation.district_id) {
        return NextResponse.json({ error: 'Location managers cannot change district assignment' }, { status: 403 })
      }
    }

    // If changing district, verify the new district exists and user has permission
    if (district_id !== currentLocation.district_id) {
      console.log(`[PUT] District change requested: ${currentLocation.district_id} -> ${district_id}`)
      const { data: newDistrict, error: districtError } = await supabase
        .from('districts')
        .select('id, name, organization_id, manager_id')
        .eq('id', district_id)
        .single()

      if (districtError || !newDistrict) {
        console.error('[PUT] Invalid district selected:', districtError)
        return NextResponse.json({ 
          error: 'Invalid district selected' 
        }, { status: 400 })
      }
      
      console.log(`[PUT] New district verified:`, { id: newDistrict.id, name: newDistrict.name })

      // Check organization permission
      if (newDistrict.organization_id !== profile.organization_id) {
        return NextResponse.json({ 
          error: 'District does not belong to your organization' 
        }, { status: 403 })
      }

      // Check role-based district access
      if (profile.role === 'district_manager' && newDistrict.manager_id !== user.id) {
        return NextResponse.json({ 
          error: 'You can only move locations to districts you manage' 
        }, { status: 403 })
      }
    }

    // Prepare update data
    const updateData = {
      district_id,
      name: name.trim(),
      address: address.trim(),
      phone: phone?.trim() || null,
      timezone: locationTimezone,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString(),
    }
    
    console.log(`[PUT] Updating location with data:`, updateData)
    
    // Update the location (simple query without relationships)
    const { data: location, error: updateError } = await supabase
      .from('locations')
      .update(updateData)
      .eq('id', params.id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[PUT] Database update error:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint
      })
      
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      
      // Handle duplicate name error within district
      if (updateError.code === '23505') {
        return NextResponse.json({ 
          error: 'A location with this name already exists in this district' 
        }, { status: 409 })
      }
      
      // Handle column not found error (missing is_active column)
      if (updateError.code === '42703') {
        console.error('[PUT] Database schema issue - column not found:', updateError.message)
        return NextResponse.json({ 
          error: 'Database schema error. Please contact support.' 
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: `Failed to update location: ${updateError.message || 'Unknown error'}` 
      }, { status: 500 })
    }

    console.log(`[PUT] Location updated successfully:`, { id: location.id, name: location.name })
    return NextResponse.json({ 
      message: 'Location updated successfully',
      location 
    })

  } catch (error) {
    console.error(`[PUT] Unexpected error in location PUT API:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      locationId: params.id
    })
    return NextResponse.json({ 
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  console.log('DELETE request for location:', params.id)
  
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

    // Check if user has permission to delete locations (super_admin or district_manager only)
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Get the location to check permissions and screens (simple query without relationships)
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Fetch district info separately
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('id, name, organization_id, manager_id')
      .eq('id', location.district_id)
      .single()

    if (districtError || !district) {
      return NextResponse.json({ error: 'Location district not found' }, { status: 404 })
    }

    // Check organization permission
    if (district.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based permission checks
    if (profile.role === 'district_manager') {
      // District manager can only delete locations in districts they manage
      if (district.manager_id !== user.id) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    }

    // Check if location has screens (prevent deletion if it has screens)
    console.log('Checking for screens in location:', params.id)
    const { data: screens, error: screensError } = await supabase
      .from('screens')
      .select('id')
      .eq('location_id', params.id)
      .limit(1)

    if (screensError) {
      console.error('Error checking screens:', screensError)
      return NextResponse.json({ error: 'Failed to verify location status' }, { status: 500 })
    }

    console.log('Found screens:', screens?.length || 0)

    if (screens && screens.length > 0) {
      console.log('Cannot delete - location has screens')
      return NextResponse.json({ 
        error: 'Cannot delete location with existing screens. Please move or delete all screens first.' 
      }, { status: 409 })
    }

    // Delete the location
    console.log('Attempting to delete location from database')
    const { error: deleteError } = await supabase
      .from('locations')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('Error deleting location:', deleteError)
      
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to delete location' 
      }, { status: 500 })
    }

    console.log('Location deleted successfully')
    return NextResponse.json({ 
      message: 'Location deleted successfully'
    })

  } catch (error) {
    console.error('Unexpected error in location DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}