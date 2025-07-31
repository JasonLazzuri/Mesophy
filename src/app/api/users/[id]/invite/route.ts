import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
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

    // Check if user has permission to send invitations for this user
    const canInvite = 
      profile.role === 'super_admin' || // Super admin can invite all
      (profile.role === 'district_manager' && 
       targetUser.role === 'location_manager' && 
       targetUser.district_id === profile.district_id) // District managers can invite location managers in their district

    if (!canInvite) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if user account is active
    if (!targetUser.is_active) {
      return NextResponse.json({ 
        error: 'Cannot send invitation to inactive user' 
      }, { status: 400 })
    }

    // Get the auth user to check if they need an invitation
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(userId)

    if (authUserError) {
      console.error('Error fetching auth user:', authUserError)
      return NextResponse.json({ 
        error: 'Failed to fetch user authentication status' 
      }, { status: 500 })
    }

    if (!authUser.user) {
      return NextResponse.json({ 
        error: 'User authentication record not found' 
      }, { status: 404 })
    }

    // Check if user has already confirmed their email
    if (authUser.user.email_confirmed_at) {
      return NextResponse.json({ 
        error: 'User has already confirmed their account' 
      }, { status: 400 })
    }

    // Send invitation email
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(targetUser.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      data: {
        full_name: targetUser.full_name,
        role: targetUser.role,
        organization_id: targetUser.organization_id
      }
    })

    if (inviteError) {
      console.error('Error sending invitation:', inviteError)
      return NextResponse.json({ 
        error: 'Failed to send invitation email' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Invitation sent successfully',
      email: targetUser.email
    })

  } catch (error) {
    console.error('Unexpected error in user invite API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}