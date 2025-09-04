import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api-responses'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return apiResponse.unauthorized('Authentication required')
    }

    const { data: profile, error } = await supabase
      .from('power_schedule_profiles')
      .select(`
        *,
        created_by_user:user_profiles!power_schedule_profiles_created_by_fkey(id, full_name),
        updated_by_user:user_profiles!power_schedule_profiles_updated_by_fkey(id, full_name),
        organization:organizations(id, name)
      `)
      .eq('id', params.id)
      .single()

    if (error || !profile) {
      return apiResponse.notFound('Power schedule profile not found')
    }

    return apiResponse.success({ profile })

  } catch (error) {
    console.error('Power schedule GET error:', error)
    return apiResponse.serverError('Internal server error')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return apiResponse.unauthorized('Authentication required')
    }

    const body = await request.json()
    const {
      profile_name,
      device_type,
      power_on_time,
      power_off_time,
      power_timezone = 'America/Los_Angeles',
      power_energy_saving = true,
      power_warning_minutes = 5
    } = body

    // Validation
    if (device_type) {
      const validDeviceTypes = ['menu_board', 'drive_thru', 'lobby_display', 'kitchen_display', 'promotional']
      if (!validDeviceTypes.includes(device_type)) {
        return apiResponse.badRequest(`Invalid device_type. Must be one of: ${validDeviceTypes.join(', ')}`)
      }
    }

    if (power_warning_minutes !== undefined && (power_warning_minutes < 0 || power_warning_minutes > 30)) {
      return apiResponse.badRequest('power_warning_minutes must be between 0 and 30')
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!userProfile) {
      return apiResponse.unauthorized('User profile not found')
    }

    // Check permissions
    if (userProfile.role !== 'super_admin' && userProfile.role !== 'district_manager') {
      return apiResponse.forbidden('Insufficient permissions to update power schedule profiles')
    }

    // Update power schedule profile
    const updateData = {
      ...(profile_name && { profile_name }),
      ...(device_type && { device_type }),
      ...(power_on_time && { power_on_time }),
      ...(power_off_time && { power_off_time }),
      ...(power_timezone && { power_timezone }),
      ...(power_energy_saving !== undefined && { power_energy_saving }),
      ...(power_warning_minutes !== undefined && { power_warning_minutes }),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    const { data: profile, error } = await supabase
      .from('power_schedule_profiles')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        organization:organizations(id, name)
      `)
      .single()

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return apiResponse.badRequest('A power schedule profile with this name already exists')
      }
      console.error('Error updating power schedule profile:', error)
      return apiResponse.serverError('Failed to update power schedule profile')
    }

    if (!profile) {
      return apiResponse.notFound('Power schedule profile not found')
    }

    return apiResponse.success({ profile })

  } catch (error) {
    console.error('Power schedule PUT error:', error)
    return apiResponse.serverError('Internal server error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return apiResponse.unauthorized('Authentication required')
    }

    // Get user profile to check permissions
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!userProfile) {
      return apiResponse.unauthorized('User profile not found')
    }

    // Check permissions
    if (userProfile.role !== 'super_admin' && userProfile.role !== 'district_manager') {
      return apiResponse.forbidden('Insufficient permissions to delete power schedule profiles')
    }

    // Delete power schedule profile
    const { error } = await supabase
      .from('power_schedule_profiles')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting power schedule profile:', error)
      return apiResponse.serverError('Failed to delete power schedule profile')
    }

    return apiResponse.success({ message: 'Power schedule profile deleted successfully' })

  } catch (error) {
    console.error('Power schedule DELETE error:', error)
    return apiResponse.serverError('Internal server error')
  }
}