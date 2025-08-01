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

    // Fetch districts for the user's organization (simplified to avoid relationship issues)
    const { data: districts, error: districtsError } = await supabase
      .from('districts')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name')

    if (districtsError) {
      console.error('Error fetching districts:', districtsError)
      return NextResponse.json({ error: 'Failed to fetch districts' }, { status: 500 })
    }

    return NextResponse.json({ districts })

  } catch (error) {
    console.error('Unexpected error in districts API:', error)
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

    // Check if user has permission to create districts (super_admin only)
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

    // Create the district
    const { data: district, error: createError } = await supabase
      .from('districts')
      .insert({
        name: name.trim(),
        description: description.trim(),
        organization_id: profile.organization_id,
        manager_id: manager_id || null,
      })
      .select('*')
      .single()

    if (createError) {
      console.error('Error creating district:', createError)
      
      // Handle duplicate name error
      if (createError.code === '23505') {
        return NextResponse.json({ 
          error: 'A district with this name already exists' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create district' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'District created successfully',
      district 
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in districts POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}