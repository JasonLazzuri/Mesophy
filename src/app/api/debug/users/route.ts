import { createClient } from '@/lib/supabase/server'
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

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get all users in the same organization (no role filtering)
    const { data: allUsers, error: allUsersError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('organization_id', profile.organization_id)

    // Get all users without organization filtering (super debug)
    const { data: absolutelyAllUsers, error: absolutelyAllError } = await supabase
      .from('user_profiles')
      .select('*')

    return NextResponse.json({
      currentUser: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        organization_id: profile.organization_id,
        district_id: profile.district_id
      },
      allUsersInOrg: allUsers?.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        organization_id: u.organization_id
      })) || [],
      absolutelyAllUsers: absolutelyAllUsers?.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        organization_id: u.organization_id
      })) || [],
      errors: {
        allUsersError,
        absolutelyAllError
      }
    })

  } catch (error) {
    console.error('Debug users error:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}