import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Only allow access in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Debug endpoints disabled in production' }, { status: 404 })
    }

    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // SECURITY: Require authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile and check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // SECURITY: Require super_admin role for this debug endpoint
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden - Super admin access required' }, { status: 403 })
    }

    // Safe debug information - only show data relevant to current user's organization
    const { data: orgUsers, error: orgUsersError } = await supabase
      .from('user_profiles')
      .select('id, email, role, is_active, created_at')
      .eq('organization_id', profile.organization_id)

    const debugInfo = {
      timestamp: new Date().toISOString(),
      currentUser: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        organization_id: profile.organization_id,
        district_id: profile.district_id
      },
      organizationUsers: {
        count: orgUsers?.length || 0,
        roles: orgUsers?.reduce((acc, u) => {
          acc[u.role] = (acc[u.role] || 0) + 1
          return acc
        }, {}) || {},
        activeCount: orgUsers?.filter(u => u.is_active).length || 0,
        // Only show emails for debugging purposes, no sensitive data
        users: orgUsers?.map(u => ({
          id: u.id,
          email: u.email,
          role: u.role,
          is_active: u.is_active,
          created_at: u.created_at
        })) || []
      },
      errors: orgUsersError ? [orgUsersError.message] : []
    }

    return NextResponse.json(debugInfo)

  } catch (error) {
    console.error('Debug users error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}