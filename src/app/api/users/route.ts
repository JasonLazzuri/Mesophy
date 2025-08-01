import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

// Helper function to create admin client with proper error handling
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  // Try different possible env var names for the service key
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                     process.env.SUPABASE_SERVICE_KEY ||
                     process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
                     process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY

  console.log('Admin client creation attempt:', {
    url: url ? 'present' : 'missing',
    serviceKey: serviceKey ? `present (${serviceKey.substring(0, 10)}...)` : 'missing'
  })

  if (!url || !serviceKey) {
    console.error('Missing required environment variables for admin client')
    return null
  }

  try {
    return createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  } catch (error) {
    console.error('Failed to create admin client:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/users - Starting user creation request')
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('POST /api/users - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('POST /api/users - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('POST /api/users - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
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
      if (role !== 'location_manager') {
        return NextResponse.json({ 
          error: 'District managers can only create location managers' 
        }, { status: 403 })
      }
      
      if (district_id !== profile.district_id) {
        return NextResponse.json({ 
          error: 'Can only assign users to your own district' 
        }, { status: 403 })
      }
    } else if (profile.role === 'location_manager') {
      return NextResponse.json({ 
        error: 'Insufficient permissions to create users' 
      }, { status: 403 })
    }

    // Create admin client
    console.log('POST /api/users - Creating admin client')
    const adminClient = createAdminClient()
    
    if (!adminClient) {
      console.error('POST /api/users - Failed to create admin client')
      return NextResponse.json({ error: 'Admin operations unavailable' }, { status: 503 })
    }

    // Check if email already exists
    console.log('POST /api/users - Checking if email exists:', email)
    const { data: existingUser, error: existingUserError } = await adminClient.auth.admin.getUserByEmail(email)
    
    if (existingUserError && existingUserError.message !== 'User not found') {
      console.error('POST /api/users - Error checking existing user:', existingUserError)
      return NextResponse.json({ error: 'Failed to validate email' }, { status: 500 })
    }

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

      if (district_id && location.district_id !== district_id) {
        return NextResponse.json({ 
          error: 'Location does not belong to the specified district' 
        }, { status: 400 })
      }
    }

    // Create user in Supabase Auth
    console.log('POST /api/users - Creating user in Supabase Auth')
    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: !send_invitation,
      user_metadata: {
        full_name,
        role,
        organization_id: profile.organization_id
      }
    })

    if (createUserError) {
      console.error('Error creating user:', createUserError)
      return NextResponse.json({ 
        error: 'Failed to create user account',
        details: createUserError.message
      }, { status: 500 })
    }

    if (!newUser.user) {
      return NextResponse.json({ 
        error: 'Failed to create user account' 
      }, { status: 500 })
    }

    // Create user profile
    console.log('POST /api/users - Creating user profile')
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
        error: 'Failed to create user profile',
        details: profileCreateError.message
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

    console.log('POST /api/users - User created successfully')
    return NextResponse.json({ 
      message: 'User created successfully',
      user: userProfile,
      invitation_sent: send_invitation
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in users POST API:', error)
    
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message,
      type: error.name
    }, { status: 500 })
  }
}