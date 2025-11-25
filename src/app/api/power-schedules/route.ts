import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { API_ERRORS, API_SUCCESS } from '@/lib/api-responses'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return API_ERRORS.UNAUTHORIZED('Authentication required')
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return API_ERRORS.PROFILE_NOT_FOUND()
    }

    // Build query based on user role
    let query = supabase
      .from('power_schedule_profiles')
      .select(`
        *,
        created_by_user:user_profiles!power_schedule_profiles_created_by_fkey(id, full_name),
        updated_by_user:user_profiles!power_schedule_profiles_updated_by_fkey(id, full_name),
        organization:organizations(id, name)
      `)

    if (userProfile.role === 'super_admin') {
      if (organizationId) {
        query = query.eq('organization_id', organizationId)
      }
    } else {
      query = query.eq('organization_id', userProfile.organization_id)
    }

    const { data: profiles, error } = await query.order('device_type', { ascending: true })

    if (error) {
      console.error('Error fetching power schedule profiles:', error)
      return API_ERRORS.DATABASE_ERROR('Failed to fetch power schedule profiles')
    }

    return API_SUCCESS.RETRIEVED({ profiles: profiles || [] })

  } catch (error) {
    console.error('Power schedules GET error:', error)
    return API_ERRORS.INTERNAL_SERVER_ERROR('Internal server error')
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return API_ERRORS.UNAUTHORIZED('Authentication required')
    }

    const body = await request.json()
    const {
      profile_name,
      device_type,
      power_on_time,
      power_off_time,
      power_timezone = 'America/Los_Angeles',
      power_energy_saving = true,
      power_warning_minutes = 5,
      days_of_week = [0, 1, 2, 3, 4, 5, 6],
      organization_id
    } = body

    // Validation
    if (!profile_name || !device_type || !power_on_time || !power_off_time) {
      return API_ERRORS.BAD_REQUEST('Missing required fields: profile_name, device_type, power_on_time, power_off_time')
    }

    const validDeviceTypes = ['menu_board', 'promo_board', 'employee_board', 'room_calendar']
    if (!validDeviceTypes.includes(device_type)) {
      return API_ERRORS.BAD_REQUEST(`Invalid device_type. Must be one of: ${validDeviceTypes.join(', ')}`)
    }

    if (power_warning_minutes < 0 || power_warning_minutes > 30) {
      return API_ERRORS.BAD_REQUEST('power_warning_minutes must be between 0 and 30')
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return API_ERRORS.PROFILE_NOT_FOUND()
    }

    // Check permissions
    if (userProfile.role !== 'super_admin' && userProfile.role !== 'district_manager') {
      return API_ERRORS.FORBIDDEN('Insufficient permissions to create power schedule profiles')
    }

    // Determine organization ID
    const targetOrgId = userProfile.role === 'super_admin' && organization_id 
      ? organization_id 
      : userProfile.organization_id

    // Create power schedule profile
    const { data: profile, error } = await supabase
      .from('power_schedule_profiles')
      .insert({
        organization_id: targetOrgId,
        profile_name,
        device_type,
        power_on_time,
        power_off_time,
        power_timezone,
        power_energy_saving,
        power_warning_minutes,
        days_of_week,
        created_by: user.id,
        updated_by: user.id
      })
      .select(`
        *,
        organization:organizations(id, name)
      `)
      .single()

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return API_ERRORS.CONFLICT('A power schedule profile with this name already exists')
      }
      console.error('Error creating power schedule profile:', error)
      return API_ERRORS.DATABASE_ERROR('Failed to create power schedule profile')
    }

    return API_SUCCESS.CREATED({ profile })

  } catch (error) {
    console.error('Power schedules POST error:', error)
    return API_ERRORS.INTERNAL_SERVER_ERROR('Internal server error')
  }
}