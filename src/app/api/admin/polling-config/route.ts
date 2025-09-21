import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin Polling Configuration API
 * Allows super admins to manage organization-wide polling schedules
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
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

    // Get polling configuration for the user's organization
    const { data: config, error: configError } = await supabase
      .from('polling_configurations')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.error('Error fetching polling configuration:', configError)
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 })
    }

    // If no configuration exists, return default values
    if (!config) {
      const defaultConfig = {
        organization_id: profile.organization_id,
        timezone: 'America/Los_Angeles',
        time_periods: [
          {
            name: 'prep_time',
            start: '06:00',
            end: '10:00',
            interval_seconds: 15,
            description: 'Morning prep time - high frequency polling'
          },
          {
            name: 'setup_time',
            start: '10:00',
            end: '12:00',
            interval_seconds: 37,
            description: 'Setup time - moderate frequency polling'
          },
          {
            name: 'service_time',
            start: '12:00',
            end: '06:00',
            interval_seconds: 900,
            description: 'Service and overnight - low frequency polling'
          }
        ],
        emergency_override: false,
        emergency_interval_seconds: 15,
        emergency_timeout_hours: 4,
        emergency_started_at: null
      }

      return NextResponse.json({
        success: true,
        config: defaultConfig,
        is_default: true
      })
    }

    return NextResponse.json({
      success: true,
      config: config,
      is_default: false
    })

  } catch (error) {
    console.error('Admin polling config GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient()
    
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
    const { timezone, time_periods, emergency_interval_seconds, emergency_timeout_hours } = body

    // Validate required fields
    if (!timezone || !time_periods || !Array.isArray(time_periods)) {
      return NextResponse.json({ 
        error: 'Missing required fields: timezone, time_periods' 
      }, { status: 400 })
    }

    // Validate time periods structure
    for (const period of time_periods) {
      if (!period.name || !period.start || !period.end || !period.interval_seconds) {
        return NextResponse.json({ 
          error: 'Each time period must have name, start, end, and interval_seconds' 
        }, { status: 400 })
      }
      
      if (period.interval_seconds < 5 || period.interval_seconds > 3600) {
        return NextResponse.json({ 
          error: 'Polling intervals must be between 5 seconds and 1 hour' 
        }, { status: 400 })
      }
    }

    // Prepare update data
    const updateData = {
      organization_id: profile.organization_id,
      timezone,
      time_periods,
      emergency_interval_seconds: emergency_interval_seconds || 15,
      emergency_timeout_hours: emergency_timeout_hours || 4,
      updated_at: new Date().toISOString()
    }

    // Upsert the configuration
    const { data: config, error: upsertError } = await supabase
      .from('polling_configurations')
      .upsert(updateData, {
        onConflict: 'organization_id',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Error updating polling configuration:', upsertError)
      return NextResponse.json({ 
        error: 'Failed to update configuration',
        details: upsertError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      config: config,
      message: 'Polling configuration updated successfully'
    })

  } catch (error) {
    console.error('Admin polling config PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}