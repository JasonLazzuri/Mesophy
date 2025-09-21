import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Emergency Override API
 * Allows super admins to activate/deactivate emergency polling for immediate content updates
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user profile and check for super admin access
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { action } = body // 'activate' or 'deactivate'

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be "activate" or "deactivate"' 
      }, { status: 400 })
    }

    let result
    if (action === 'activate') {
      // Use the database function to activate emergency override
      const { data, error } = await supabase.rpc('activate_emergency_override', {
        p_organization_id: profile.organization_id
      })
      
      if (error) {
        console.error('Error activating emergency override:', error)
        return NextResponse.json({ 
          error: 'Failed to activate emergency override',
          details: error.message
        }, { status: 500 })
      }
      
      result = { activated: data }
    } else {
      // Use the database function to deactivate emergency override
      const { data, error } = await supabase.rpc('deactivate_emergency_override', {
        p_organization_id: profile.organization_id
      })
      
      if (error) {
        console.error('Error deactivating emergency override:', error)
        return NextResponse.json({ 
          error: 'Failed to deactivate emergency override',
          details: error.message
        }, { status: 500 })
      }
      
      result = { deactivated: data }
    }

    // Get updated configuration to return current state
    const { data: config, error: configError } = await supabase
      .from('polling_configurations')
      .select('emergency_override, emergency_started_at, emergency_timeout_hours')
      .eq('organization_id', profile.organization_id)
      .single()

    if (configError) {
      console.error('Error fetching updated config:', configError)
      // Still return success but without updated config
      return NextResponse.json({
        success: true,
        action: action,
        result: result,
        message: `Emergency override ${action}d successfully`
      })
    }

    return NextResponse.json({
      success: true,
      action: action,
      result: result,
      current_state: {
        emergency_override: config.emergency_override,
        emergency_started_at: config.emergency_started_at,
        emergency_timeout_hours: config.emergency_timeout_hours,
        will_timeout_at: config.emergency_override && config.emergency_started_at ? 
          new Date(new Date(config.emergency_started_at).getTime() + (config.emergency_timeout_hours * 60 * 60 * 1000)).toISOString() : 
          null
      },
      message: `Emergency override ${action}d successfully`
    })

  } catch (error) {
    console.error('Emergency override API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user profile and check for super admin access
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    // Get current emergency override status
    const { data: config, error: configError } = await supabase
      .from('polling_configurations')
      .select('emergency_override, emergency_started_at, emergency_timeout_hours, emergency_interval_seconds')
      .eq('organization_id', profile.organization_id)
      .single()

    if (configError) {
      console.error('Error fetching emergency status:', configError)
      return NextResponse.json({ 
        error: 'Failed to fetch emergency status',
        details: configError.message
      }, { status: 500 })
    }

    // Calculate timeout information
    let timeoutInfo = null
    if (config.emergency_override && config.emergency_started_at) {
      const startedAt = new Date(config.emergency_started_at)
      const timeoutAt = new Date(startedAt.getTime() + (config.emergency_timeout_hours * 60 * 60 * 1000))
      const now = new Date()
      const remainingMinutes = Math.max(0, Math.floor((timeoutAt.getTime() - now.getTime()) / (1000 * 60)))
      
      timeoutInfo = {
        started_at: config.emergency_started_at,
        will_timeout_at: timeoutAt.toISOString(),
        remaining_minutes: remainingMinutes,
        has_timed_out: remainingMinutes === 0
      }
    }

    return NextResponse.json({
      success: true,
      emergency_status: {
        is_active: config.emergency_override,
        interval_seconds: config.emergency_interval_seconds,
        timeout_hours: config.emergency_timeout_hours,
        timeout_info: timeoutInfo
      }
    })

  } catch (error) {
    console.error('Emergency override GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}