import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
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

    // Build query based on user role and permissions
    let query = supabase
      .from('locations')
      .select(`
        *,
        district:districts(id,name)
      `)

    // Apply role-based filtering
    if (profile.role === 'super_admin') {
      // Super admin can see all locations in their organization
      const { data: orgDistricts } = await supabase
        .from('districts')
        .select('id')
        .eq('organization_id', profile.organization_id)
      
      const districtIds = orgDistricts?.map(d => d.id) || []
      if (districtIds.length > 0) {
        query = query.in('district_id', districtIds)
      } else {
        // No districts in organization, return empty result
        return NextResponse.json({ locations: [] })
      }
    } else if (profile.role === 'district_manager') {
      // District manager can only see locations in districts they manage
      const { data: managedDistricts } = await supabase
        .from('districts')
        .select('id')
        .eq('manager_id', user.id)
        .eq('organization_id', profile.organization_id)
      
      const districtIds = managedDistricts?.map(d => d.id) || []
      if (districtIds.length > 0) {
        query = query.in('district_id', districtIds)
      } else {
        // No managed districts, return empty result
        return NextResponse.json({ locations: [] })
      }
    } else if (profile.role === 'location_manager') {
      // Location manager can only see their own location
      query = query.eq('manager_id', user.id)
    } else {
      // Other roles have no access
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: locations, error: locationsError } = await query.order('name')

    if (locationsError) {
      console.error('Error fetching locations:', locationsError)
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
    }

    return NextResponse.json({ locations })

  } catch (error) {
    console.error('Unexpected error in locations API:', error)
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

    // Check if user has permission to create locations (super_admin or district_manager)
    if (profile.role !== 'super_admin' && profile.role !== 'district_manager') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { district_id, name, address, phone, timezone } = body

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

    // Verify the district exists and user has permission to add locations to it
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('id, name, organization_id, manager_id')
      .eq('id', district_id)
      .single()

    if (districtError || !district) {
      return NextResponse.json({ 
        error: 'Invalid district selected' 
      }, { status: 400 })
    }

    // Check organization permission
    if (district.organization_id !== profile.organization_id) {
      return NextResponse.json({ 
        error: 'District does not belong to your organization' 
      }, { status: 403 })
    }

    // Check role-based district access
    if (profile.role === 'district_manager' && district.manager_id !== user.id) {
      return NextResponse.json({ 
        error: 'You can only add locations to districts you manage' 
      }, { status: 403 })
    }

    // Create the location
    const { data: location, error: createError } = await supabase
      .from('locations')
      .insert({
        district_id,
        name: name.trim(),
        address: address.trim(),
        phone: phone?.trim() || null,
        timezone: locationTimezone,
        is_active: true
      })
      .select(`
        *,
        district:districts(id,name)
      `)
      .single()

    if (createError) {
      console.error('Error creating location:', createError)
      
      // Handle duplicate name error within district
      if (createError.code === '23505') {
        return NextResponse.json({ 
          error: 'A location with this name already exists in this district' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create location' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Location created successfully',
      location 
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in locations POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}