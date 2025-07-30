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

    // Fetch the specific location with district info
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select(`
        *,
        district:districts(
          id,
          name,
          organization_id,
          manager_id
        )
      `)
      .eq('id', params.id)
      .single()

    if (locationError) {
      if (locationError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      console.error('Error fetching location:', locationError)
      return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 })
    }

    // Check if user has permission to view this location
    if (!location.district) {
      return NextResponse.json({ error: 'Location district not found' }, { status: 404 })
    }

    // Check organization permission
    if (location.district.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based access control
    if (profile.role === 'district_manager') {
      // District manager can only view locations in districts they manage
      if (location.district.manager_id !== user.id) {
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

    return NextResponse.json({ location })

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

    // Check if user has permission to update locations
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager' && profile.role !== 'location_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { district_id, name, address, phone, timezone, is_active } = body

    // Validate required fields
    if (!district_id || !name || !address) {
      return NextResponse.json({ 
        error: 'District, name, and address are required' 
      }, { status: 400 })
    }

    // Validate field lengths
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ 
        error: 'Name must be between 2 and 100 characters' 
      }, { status: 400 })
    }

    if (address.length < 5 || address.length > 500) {
      return NextResponse.json({ 
        error: 'Address must be between 5 and 500 characters' 
      }, { status: 400 })
    }

    // Validate phone number if provided
    if (phone && (phone.length < 10 || phone.length > 20)) {
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

    // Get the current location to check permissions
    const { data: currentLocation, error: currentLocationError } = await supabase
      .from('locations')
      .select(`
        *,
        district:districts(
          id,
          name,
          organization_id,
          manager_id
        )
      `)
      .eq('id', params.id)
      .single()

    if (currentLocationError || !currentLocation) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Check organization permission
    if (!currentLocation.district || currentLocation.district.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based permission checks
    if (profile.role === 'district_manager') {
      // District manager can only update locations in districts they manage
      if (currentLocation.district.manager_id !== user.id) {
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
      const { data: newDistrict, error: districtError } = await supabase
        .from('districts')
        .select('id, name, organization_id, manager_id')
        .eq('id', district_id)
        .single()

      if (districtError || !newDistrict) {
        return NextResponse.json({ 
          error: 'Invalid district selected' 
        }, { status: 400 })
      }

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

    // Update the location
    const { data: location, error: updateError } = await supabase
      .from('locations')
      .update({
        district_id,
        name: name.trim(),
        address: address.trim(),
        phone: phone?.trim() || null,
        timezone: locationTimezone,
        is_active: is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select(`
        *,
        district:districts(id,name)
      `)
      .single()

    if (updateError) {
      console.error('Error updating location:', updateError)
      
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      
      // Handle duplicate name error within district
      if (updateError.code === '23505') {
        return NextResponse.json({ 
          error: 'A location with this name already exists in this district' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to update location' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Location updated successfully',
      location 
    })

  } catch (error) {
    console.error('Unexpected error in location PUT API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    // Get the location to check permissions and screens
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select(`
        *,
        district:districts(
          id,
          name,
          organization_id,
          manager_id
        )
      `)
      .eq('id', params.id)
      .single()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Check organization permission
    if (!location.district || location.district.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Role-based permission checks
    if (profile.role === 'district_manager') {
      // District manager can only delete locations in districts they manage
      if (location.district.manager_id !== user.id) {
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