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

    // Fetch the specific district
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select(`
        *,
        user_profiles!districts_manager_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .eq('id', params.id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (districtError) {
      if (districtError.code === 'PGRST116') {
        return NextResponse.json({ error: 'District not found' }, { status: 404 })
      }
      console.error('Error fetching district:', districtError)
      return NextResponse.json({ error: 'Failed to fetch district' }, { status: 500 })
    }

    return NextResponse.json({ district })

  } catch (error) {
    console.error('Unexpected error in district GET API:', error)
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

    // Check if user has permission to update districts (super_admin only)
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { name, description, manager_id } = body

    // Validate required fields
    if (!name || !description) {
      return NextResponse.json({ 
        error: 'Name and description are required' 
      }, { status: 400 })
    }

    // Validate field lengths
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ 
        error: 'Name must be between 2 and 100 characters' 
      }, { status: 400 })
    }

    if (description.length < 10 || description.length > 500) {
      return NextResponse.json({ 
        error: 'Description must be between 10 and 500 characters' 
      }, { status: 400 })
    }

    // If manager_id is provided, verify the manager exists and belongs to the organization
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from('user_profiles')
        .select('id, role, organization_id')
        .eq('id', manager_id)
        .eq('organization_id', profile.organization_id)
        .single()

      if (managerError || !manager) {
        return NextResponse.json({ 
          error: 'Invalid manager selected' 
        }, { status: 400 })
      }

      if (manager.role !== 'district_manager' && manager.role !== 'super_admin') {
        return NextResponse.json({ 
          error: 'Selected user is not a district manager' 
        }, { status: 400 })
      }
    }

    // Update the district
    const { data: district, error: updateError } = await supabase
      .from('districts')
      .update({
        name: name.trim(),
        description: description.trim(),
        manager_id: manager_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', profile.organization_id)
      .select(`
        *,
        user_profiles!districts_manager_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .single()

    if (updateError) {
      console.error('Error updating district:', updateError)
      
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'District not found' }, { status: 404 })
      }
      
      // Handle duplicate name error
      if (updateError.code === '23505') {
        return NextResponse.json({ 
          error: 'A district with this name already exists' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to update district' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'District updated successfully',
      district 
    })

  } catch (error) {
    console.error('Unexpected error in district PUT API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    // Check if user has permission to delete districts (super_admin only)
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Check if district has locations (prevent deletion if it has locations)
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select('id')
      .eq('district_id', params.id)
      .limit(1)

    if (locationsError) {
      console.error('Error checking locations:', locationsError)
      return NextResponse.json({ error: 'Failed to verify district status' }, { status: 500 })
    }

    if (locations && locations.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete district with existing locations. Please move or delete all locations first.' 
      }, { status: 409 })
    }

    // Delete the district
    const { error: deleteError } = await supabase
      .from('districts')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', profile.organization_id)

    if (deleteError) {
      console.error('Error deleting district:', deleteError)
      
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json({ error: 'District not found' }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to delete district' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'District deleted successfully'
    })

  } catch (error) {
    console.error('Unexpected error in district DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}