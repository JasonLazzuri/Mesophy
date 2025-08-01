import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceKey, debugEnvironment } from './runtime-config'

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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const status = searchParams.get('status') || ''

    // Build base query with role-based filtering
    let query = supabase
      .from('user_profiles')
      .select(`
        *,
        district:districts(id, name),
        location:locations(id, name)
      `)
      .eq('organization_id', profile.organization_id)

    // Role-based access control
    if (profile.role === 'district_manager') {
      // District managers can only see location managers in their districts
      query = query.eq('role', 'location_manager')
      
      // If user has district_id, filter by it
      if (profile.district_id) {
        query = query.eq('district_id', profile.district_id)
      }
    } else if (profile.role === 'location_manager') {
      // Location managers can only see themselves
      query = query.eq('id', user.id)
    }
    // Super admins see all users (no additional filtering)

    // Apply search filter
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    // Apply role filter
    if (role) {
      query = query.eq('role', role)
    }

    // Apply status filter
    if (status === 'active') {
      query = query.eq('is_active', true)
    } else if (status === 'inactive') {
      query = query.eq('is_active', false)
    }

    // Order by name
    query = query.order('full_name', { nullsFirst: false })

    const { data: users, error: usersError } = await query

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({ users })

  } catch (error) {
    console.error('Unexpected error in users API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/users - Starting user creation request')
    console.log('POST /api/users - Environment debug:', debugEnvironment())
    
    // Test service key function immediately
    console.log('POST /api/users - Testing getServiceKey function...')
    const testServiceKey = getServiceKey()
    console.log('POST /api/users - Service key test result:', testServiceKey ? 'SUCCESS' : 'FAILED')
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('POST /api/users - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }
    
    console.log('POST /api/users - Supabase client created successfully')

    // Get current user
    console.log('POST /api/users - Getting current user')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('POST /api/users - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log('POST /api/users - Current user authenticated:', user.id)

    // Get user profile to check permissions
    console.log('POST /api/users - Getting user profile')
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('POST /api/users - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }
    console.log('POST /api/users - Profile found:', { role: profile.role, org_id: profile.organization_id })

    if (!profile.organization_id) {
      console.error('POST /api/users - No organization ID in profile')
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    console.log('POST /api/users - Parsing request body')
    const body = await request.json()
    console.log('POST /api/users - Request body:', body)
    const { email, full_name, role, district_id, location_id, send_invitation = true } = body

    // Validate required fields
    if (!email || !full_name || !role) {
      return NextResponse.json({ 
        error: 'Email, full name, and role are required' 
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        error: 'Invalid email format' 
      }, { status: 400 })
    }

    // Validate role
    const validRoles = ['super_admin', 'district_manager', 'location_manager']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ 
        error: 'Invalid role specified' 
      }, { status: 400 })
    }

    // Role-based permission checks
    if (profile.role === 'district_manager') {
      // District managers can only create location managers
      if (role !== 'location_manager') {
        return NextResponse.json({ 
          error: 'District managers can only create location managers' 
        }, { status: 403 })
      }
      
      // Must assign to their district
      if (district_id !== profile.district_id) {
        return NextResponse.json({ 
          error: 'Can only assign users to your own district' 
        }, { status: 403 })
      }
    } else if (profile.role === 'location_manager') {
      // Location managers cannot create users
      return NextResponse.json({ 
        error: 'Insufficient permissions to create users' 
      }, { status: 403 })
    }
    // Super admins can create any role

    // Check if email already exists using admin client
    console.log('POST /api/users - Checking if email exists:', email)
    console.log('POST /api/users - Service key debug:', getServiceKey() ? 'present' : 'missing')
    
    let adminClient = createAdminClient()
    console.log('POST /api/users - Standard admin client result:', adminClient ? 'success' : 'failed')
    
    // If admin client creation failed, try manual creation
    if (!adminClient) {
      console.log('POST /api/users - Standard admin client failed, trying manual creation')
      const serviceKey = getServiceKey()
      console.log('POST /api/users - Service key for manual creation:', serviceKey ? `present (${serviceKey.substring(0, 10)}...)` : 'missing')
      
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
          adminClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          })
          console.log('POST /api/users - Manual admin client created successfully')
        } catch (error) {
          console.error('POST /api/users - Manual admin client creation failed:', error)
          return NextResponse.json({ 
            error: 'Failed to create admin client', 
            details: error.message 
          }, { status: 500 })
        }
      } else {
        console.error('POST /api/users - Missing requirements for manual admin client:', {
          hasServiceKey: !!serviceKey,
          hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL
        })
      }
    }
    
    if (!adminClient) {
      console.error('POST /api/users - Admin client not available after all attempts')
      return NextResponse.json({ error: 'Admin operations unavailable' }, { status: 503 })
    }
    
    console.log('POST /api/users - Admin client ready, proceeding with user existence check')
    
    const { data: existingUser, error: existingUserError } = await adminClient.auth.admin.getUserByEmail(email)
    
    if (existingUserError && existingUserError.message !== 'User not found') {
      console.error('POST /api/users - Error checking existing user:', existingUserError)
      return NextResponse.json({ error: 'Failed to validate email' }, { status: 500 })
    }
    console.log('POST /api/users - Existing user check complete')

    if (existingUser.user) {
      return NextResponse.json({ 
        error: 'User with this email already exists' 
      }, { status: 409 })
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

    // Create user in Supabase Auth using admin client
    console.log('POST /api/users - Creating user in Supabase Auth')
    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: !send_invitation, // If not sending invitation, auto-confirm email
      user_metadata: {
        full_name,
        role,
        organization_id: profile.organization_id
      }
    })

    if (createUserError) {
      console.error('Error creating user:', createUserError)
      return NextResponse.json({ 
        error: 'Failed to create user account' 
      }, { status: 500 })
    }

    if (!newUser.user) {
      return NextResponse.json({ 
        error: 'Failed to create user account' 
      }, { status: 500 })
    }

    // Create user profile
    const { data: userProfile, error: profileCreateError } = await supabase
      .from('user_profiles')
      .insert({
        id: newUser.user.id,
        email,
        full_name,
        role,
        organization_id: profile.organization_id,
        district_id: district_id || null,
        location_id: location_id || null,
        is_active: true
      })
      .select(`
        *,
        district:districts(id, name),
        location:locations(id, name)
      `)
      .single()

    if (profileCreateError) {
      console.error('Error creating user profile:', profileCreateError)
      
      // Clean up the auth user if profile creation failed
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      
      return NextResponse.json({ 
        error: 'Failed to create user profile' 
      }, { status: 500 })
    }

    // Send invitation email if requested
    if (send_invitation) {
      console.log('POST /api/users - Sending invitation email')
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      })

      if (inviteError) {
        console.error('Error sending invitation:', inviteError)
        // Don't fail the whole operation if invitation fails
      }
    }

    return NextResponse.json({ 
      message: 'User created successfully',
      user: userProfile,
      invitation_sent: send_invitation
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in users POST API:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message,
      name: error.name,
      details: process.env.NODE_ENV === 'development' ? error.stack : 'Hidden in production'
    }, { status: 500 })
  }
}