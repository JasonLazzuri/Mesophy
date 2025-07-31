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

    // Check if user has permission to reset password for this user
    const canReset = 
      profile.role === 'super_admin' || // Super admin can reset all
      targetUser.id === user.id || // Users can reset their own password
      (profile.role === 'district_manager' && 
       targetUser.role === 'location_manager' && 
       targetUser.district_id === profile.district_id) // District managers can reset location managers in their district

    if (!canReset) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if user account is active
    if (!targetUser.is_active) {
      return NextResponse.json({ 
        error: 'Cannot reset password for inactive user' 
      }, { status: 400 })
    }

    // Create a Supabase client for password reset (this uses the service role)
    const supabaseAdmin = await createClient()

    // Send password reset email
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(targetUser.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?type=recovery`
    })

    if (resetError) {
      console.error('Error sending password reset:', resetError)
      return NextResponse.json({ 
        error: 'Failed to send password reset email' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Password reset email sent successfully',
      email: targetUser.email
    })

  } catch (error) {
    console.error('Unexpected error in password reset API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}