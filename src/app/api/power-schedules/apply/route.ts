import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { API_ERRORS, API_SUCCESS } from '@/lib/api-responses'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return API_ERRORS.UNAUTHORIZED('Authentication required')
    }

    const body = await request.json()
    const {
      profile_id,
      target_device_type,
      target_location_ids,
      apply_to_all = false
    } = body

    // Validation
    if (!profile_id) {
      return API_ERRORS.BAD_REQUEST('profile_id is required')
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
      return API_ERRORS.FORBIDDEN('Insufficient permissions to apply power schedule profiles')
    }

    // Verify profile exists and user has access to it
    const { data: profile, error: profileError } = await supabase
      .from('power_schedule_profiles')
      .select('*')
      .eq('id', profile_id)
      .single()

    if (profileError || !profile) {
      return API_ERRORS.NOT_FOUND('Power schedule profile')
    }

    // Super admins can apply to any organization, others only their own
    if (userProfile.role !== 'super_admin' && profile.organization_id !== userProfile.organization_id) {
      return API_ERRORS.FORBIDDEN('Access denied to this power schedule profile')
    }

    try {
      // Call the database function to apply the profile
      const { data, error } = await supabase
        .rpc('apply_power_schedule_profile', {
          profile_id: profile_id,
          target_device_type: target_device_type || null,
          target_location_ids: target_location_ids || null
        })

      if (error) {
        console.error('Error applying power schedule profile:', error)
        return API_ERRORS.DATABASE_ERROR('Failed to apply power schedule profile')
      }

      const result = data?.[0] || { updated_count: 0, screen_ids: [] }

      // Queue power schedule update commands for affected devices
      if (result.screen_ids && result.screen_ids.length > 0) {
        // Get device info for screens that were updated
        const { data: screens, error: screensError } = await supabase
          .from('screens')
          .select('id, device_id, power_on_time, power_off_time, power_timezone, power_energy_saving, power_warning_minutes')
          .in('id', result.screen_ids)
          .not('device_id', 'is', null)

        if (!screensError && screens && screens.length > 0) {
          // Queue device commands for each updated screen with a paired device
          const commands = screens.map(screen => ({
            device_id: screen.device_id,
            screen_id: screen.id,
            command_type: 'update_power_schedule',
            command_data: {
              power_schedule_data: {
                enabled: true,
                on_time: screen.power_on_time,
                off_time: screen.power_off_time,
                timezone: screen.power_timezone,
                energy_saving: screen.power_energy_saving,
                warning_minutes: screen.power_warning_minutes
              },
              source: 'bulk_power_schedule_update',
              profile_id: profile_id,
              applied_by: user.id
            },
            priority: 3, // Normal-high priority
            created_by: user.id
          }))

          await supabase
            .from('device_commands')
            .insert(commands)
        }
      }

      return API_SUCCESS.RETRIEVED({
        message: `Power schedule profile applied successfully to ${result.updated_count} screens`,
        profile: {
          id: profile.id,
          name: profile.profile_name,
          device_type: profile.device_type
        },
        applied_to: {
          screen_count: result.updated_count,
          screen_ids: result.screen_ids,
          device_type: target_device_type,
          location_ids: target_location_ids
        }
      })

    } catch (dbError) {
      console.error('Database function error:', dbError)
      return apiResponse.serverError('Failed to apply power schedule profile')
    }

  } catch (error) {
    console.error('Apply power schedule error:', error)
    return API_ERRORS.INTERNAL_SERVER_ERROR('Internal server error')
  }
}