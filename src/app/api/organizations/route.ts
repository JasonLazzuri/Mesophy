import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/organizations - Starting request')
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('GET /api/organizations - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user and check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('GET /api/organizations - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions and organization
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('GET /api/organizations - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    console.log('GET /api/organizations - Query params:', { search, status })

    // Build query - users can only see their own organization
    let query = supabase
      .from('organizations')
      .select(`
        *,
        districts:districts(count),
        locations:locations(count)
      `)
      .eq('id', profile.organization_id)

    // Apply search filters
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    
    if (status === 'active') {
      query = query.eq('is_active', true)
    } else if (status === 'inactive') {
      query = query.eq('is_active', false)
    }

    const { data: organizations, error: orgsError } = await query

    if (orgsError) {
      console.error('GET /api/organizations - Failed to fetch organizations:', orgsError)
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })
    }

    console.log('GET /api/organizations - Organizations fetched successfully:', {
      count: organizations?.length || 0
    })

    return NextResponse.json({ organizations: organizations || [] })

  } catch (error) {
    console.error('GET /api/organizations - Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/organizations - Starting organization creation request')
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('POST /api/organizations - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user and check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('POST /api/organizations - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('POST /api/organizations - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Only super admins can create organizations (typically system-level operation)
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ 
        error: 'Insufficient permissions to create organizations' 
      }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { name, description, settings = {}, is_active = true } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json({ 
        error: 'Organization name is required' 
      }, { status: 400 })
    }

    // Validate name length
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ 
        error: 'Organization name must be between 2 and 100 characters' 
      }, { status: 400 })
    }

    // Check if organization name already exists
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .ilike('name', name)
      .limit(1)

    if (existingOrg && existingOrg.length > 0) {
      return NextResponse.json({ 
        error: 'Organization with this name already exists' 
      }, { status: 409 })
    }

    // Create organization
    console.log('POST /api/organizations - Creating organization')
    const { data: organization, error: createError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        settings: settings || {},
        is_active,
        created_by: user.id
      })
      .select()
      .single()

    if (createError) {
      console.error('POST /api/organizations - Error creating organization:', createError)
      return NextResponse.json({ 
        error: 'Failed to create organization',
        details: createError.message
      }, { status: 500 })
    }

    console.log('POST /api/organizations - Organization created successfully:', organization.id)
    return NextResponse.json({ 
      message: 'Organization created successfully',
      organization
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in organizations POST API:', error)
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}