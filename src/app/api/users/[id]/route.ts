import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('GET /api/users/[id] - Starting request for user:', params.id)
    
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('GET /api/users/[id] - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const userId = params.id

    // Get the target user using REST API
    const userResponse = await fetch(`${url}/rest/v1/user_profiles?id=eq.${userId}&select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error('GET /api/users/[id] - Failed to fetch user:', userResponse.status, errorText)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const users = await userResponse.json()
    const targetUser = users[0]

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('GET /api/users/[id] - Found user:', {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role
    })

    // Enrich user with district and location information
    const enrichedUser = { ...targetUser }
    
    // Get district info if user has district_id
    if (targetUser.district_id) {
      try {
        const districtResponse = await fetch(`${url}/rest/v1/districts?id=eq.${targetUser.district_id}&select=id,name`, {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          }
        })
        
        if (districtResponse.ok) {
          const districts = await districtResponse.json()
          if (districts[0]) {
            enrichedUser.district = districts[0]
          }
        }
      } catch (err) {
        console.warn('Failed to fetch district for user:', targetUser.id, err)
      }
    }
    
    // Get location info if user has location_id
    if (targetUser.location_id) {
      try {
        const locationResponse = await fetch(`${url}/rest/v1/locations?id=eq.${targetUser.location_id}&select=id,name`, {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          }
        })
        
        if (locationResponse.ok) {
          const locations = await locationResponse.json()
          if (locations[0]) {
            enrichedUser.location = locations[0]
          }
        }
      } catch (err) {
        console.warn('Failed to fetch location for user:', targetUser.id, err)
      }
    }

    // Get organization info if user has organization_id
    if (targetUser.organization_id) {
      try {
        const orgResponse = await fetch(`${url}/rest/v1/organizations?id=eq.${targetUser.organization_id}&select=id,name`, {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          }
        })
        
        if (orgResponse.ok) {
          const orgs = await orgResponse.json()
          if (orgs[0]) {
            enrichedUser.organization = orgs[0]
          }
        }
      } catch (err) {
        console.warn('Failed to fetch organization for user:', targetUser.id, err)
      }
    }

    console.log('GET /api/users/[id] - Returning enriched user')
    return NextResponse.json({ user: enrichedUser })

  } catch (error) {
    console.error('GET /api/users/[id] - Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
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

    const userId = params.id

    // Get the target user
    const { data: targetUser, error: targetUserError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure user belongs to same organization
    if (targetUser.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { full_name, role, district_id, location_id, is_active } = body

    // Check if user has permission to edit this user
    const canEdit = 
      profile.role === 'super_admin' || // Super admin can edit all
      (profile.role === 'district_manager' && 
       targetUser.role === 'location_manager' && 
       targetUser.district_id === profile.district_id) || // District managers can edit location managers in their district
      (targetUser.id === user.id && !role && is_active !== false) // Users can edit their own profile (except role and deactivating themselves)

    if (!canEdit) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Prevent users from changing their own role or deactivating themselves
    if (targetUser.id === user.id) {
      if (role && role !== targetUser.role) {
        return NextResponse.json({ error: 'Cannot change your own role' }, { status: 403 })
      }
      if (is_active === false) {
        return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 403 })
      }
    }

    // Role-based permission checks for role changes
    if (role && role !== targetUser.role) {
      if (profile.role === 'district_manager') {
        return NextResponse.json({ 
          error: 'District managers cannot change user roles' 
        }, { status: 403 })
      }
      
      // Validate role
      const validRoles = ['super_admin', 'district_manager', 'location_manager']
      if (!validRoles.includes(role)) {
        return NextResponse.json({ 
          error: 'Invalid role specified' 
        }, { status: 400 })
      }
    }

    // Role-based permission checks for district assignments
    if (district_id !== undefined && profile.role === 'district_manager') {
      if (district_id !== profile.district_id) {
        return NextResponse.json({ 
          error: 'Can only assign users to your own district' 
        }, { status: 403 })
      }
    }

    // Validate district and location assignments
    if (district_id) {
      const { data: district, error: districtError } = await supabase
        .from('districts')
        .select('id')
        .eq('id', district_id)
        .eq('organization_id', profile.organization_id)
        .single()

      if (districtError || !district) {
        return NextResponse.json({ 
          error: 'Invalid district selected' 
        }, { status: 400 })
      }
    }

    if (location_id) {
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .select('id, district_id')
        .eq('id', location_id)
        .single()

      if (locationError || !location) {
        return NextResponse.json({ 
          error: 'Invalid location selected' 
        }, { status: 400 })
      }

      // Ensure location belongs to the specified district
      if (district_id && location.district_id !== district_id) {
        return NextResponse.json({ 
          error: 'Location does not belong to the specified district' 
        }, { status: 400 })
      }
    }

    // Build update object
    const updateData: any = {}
    if (full_name !== undefined) updateData.full_name = full_name
    if (role !== undefined) updateData.role = role
    if (district_id !== undefined) updateData.district_id = district_id
    if (location_id !== undefined) updateData.location_id = location_id
    if (is_active !== undefined) updateData.is_active = is_active
    updateData.updated_at = new Date().toISOString()

    // Update user profile
    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select(`
        *,
        district:districts(id, name),
        location:locations(id, name)
      `)
      .single()

    if (updateError) {
      console.error('Error updating user:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update user' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'User updated successfully',
      user: updatedUser 
    })

  } catch (error) {
    console.error('Unexpected error in user PUT API:', error)
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

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    const userId = params.id

    // Prevent users from deleting themselves
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 403 })
    }

    // Get the target user
    const { data: targetUser, error: targetUserError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure user belongs to same organization
    if (targetUser.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user has permission to delete this user
    const canDelete = 
      profile.role === 'super_admin' || // Super admin can delete all
      (profile.role === 'district_manager' && 
       targetUser.role === 'location_manager' && 
       targetUser.district_id === profile.district_id) // District managers can delete location managers in their district

    if (!canDelete) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if user has any dependent records that would prevent deletion
    // Check if user is managing any districts
    const { data: managedDistricts, error: managedDistrictsError } = await supabase
      .from('districts')
      .select('id')
      .eq('manager_id', userId)

    if (managedDistrictsError) {
      console.error('Error checking managed districts:', managedDistrictsError)
      return NextResponse.json({ error: 'Failed to validate user deletion' }, { status: 500 })
    }

    if (managedDistricts && managedDistricts.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete user who is managing districts. Please reassign districts first.' 
      }, { status: 409 })
    }

    // Check if user is managing any locations
    const { data: managedLocations, error: managedLocationsError } = await supabase
      .from('locations')
      .select('id')
      .eq('manager_id', userId)

    if (managedLocationsError) {
      console.error('Error checking managed locations:', managedLocationsError)
      return NextResponse.json({ error: 'Failed to validate user deletion' }, { status: 500 })
    }

    if (managedLocations && managedLocations.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete user who is managing locations. Please reassign locations first.' 
      }, { status: 409 })
    }

    // Delete user profile first
    const { error: deleteProfileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (deleteProfileError) {
      console.error('Error deleting user profile:', deleteProfileError)
      return NextResponse.json({ 
        error: 'Failed to delete user profile' 
      }, { status: 500 })
    }

    // Delete user from Supabase Auth
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      console.error('Error deleting user from auth:', deleteAuthError)
      // This is not critical since the profile is already deleted
    }

    return NextResponse.json({ 
      message: 'User deleted successfully' 
    })

  } catch (error) {
    console.error('Unexpected error in user DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}