import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api-responses'
import { authenticateUser } from '@/lib/secure-auth'

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await authenticateUser(request)
    const { action, screen_id, device_id } = await request.json()

    if (!action || !screen_id) {
      return apiResponse.badRequest('Action and screen_id are required')
    }

    // Get screen and verify user has access
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        *,
        location:locations (
          id,
          name,
          district:districts (
            id, 
            name,
            organization_id
          )
        )
      `)
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      return apiResponse.notFound('Screen not found')
    }

    // Verify user has access to this screen
    const { data: hasAccess } = await supabase
      .rpc('user_can_access_location', {
        user_id: user.id,
        location_id: screen.location_id
      })

    if (!hasAccess) {
      return apiResponse.unauthorized('Access denied to this screen')
    }

    switch (action) {
      case 'restart':
        // Log restart request - actual restart would be handled by Pi polling this endpoint
        const { error: logError } = await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'restart_requested',
            details: {
              requested_by: user.id,
              requested_at: new Date().toISOString(),
              device_id: device_id
            }
          })

        if (logError) {
          return apiResponse.internalError('Failed to log restart request')
        }

        return apiResponse.success({
          message: 'Restart request logged successfully',
          action: 'restart',
          screen_id: screen_id,
          device_id: device_id
        })

      case 'force_sync':
        // Update sync request flag
        const { error: updateError } = await supabase
          .from('screens')
          .update({ 
            updated_at: new Date().toISOString() 
          })
          .eq('id', screen_id)

        if (updateError) {
          return apiResponse.internalError('Failed to trigger sync')
        }

        // Log sync request
        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'force_sync_requested',
            details: {
              requested_by: user.id,
              requested_at: new Date().toISOString(),
              device_id: device_id
            }
          })

        return apiResponse.success({
          message: 'Force sync requested successfully',
          action: 'force_sync',
          screen_id: screen_id
        })

      case 'get_logs':
        // Get recent device logs
        const { data: logs, error: logsError } = await supabase
          .from('device_sync_log')
          .select('*')
          .eq('screen_id', screen_id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (logsError) {
          return apiResponse.internalError('Failed to fetch logs')
        }

        return apiResponse.success({
          logs: logs || [],
          screen_id: screen_id
        })

      case 'get_status':
        // Get current device status
        const { data: currentScreen, error: statusError } = await supabase
          .from('screens')
          .select('*')
          .eq('id', screen_id)
          .single()

        if (statusError || !currentScreen) {
          return apiResponse.internalError('Failed to get device status')
        }

        return apiResponse.success({
          device_status: currentScreen.device_status,
          last_seen: currentScreen.last_seen,
          last_sync_at: currentScreen.last_sync_at,
          device_info: currentScreen.device_info,
          is_active: currentScreen.is_active,
          screen_id: screen_id
        })

      case 'unpair':
        // Remove device pairing
        const { error: unpairError } = await supabase
          .from('screens')
          .update({
            device_token: null,
            device_id: null,
            device_status: 'offline',
            device_info: null,
            last_sync_at: null
          })
          .eq('id', screen_id)

        if (unpairError) {
          return apiResponse.internalError('Failed to unpair device')
        }

        // Log unpair action
        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'device_unpaired',
            details: {
              unpaired_by: user.id,
              unpaired_at: new Date().toISOString(),
              previous_device_id: device_id
            }
          })

        return apiResponse.success({
          message: 'Device unpaired successfully',
          action: 'unpair',
          screen_id: screen_id
        })

      default:
        return apiResponse.badRequest(`Unsupported action: ${action}`)
    }

  } catch (error) {
    console.error('Device management error:', error)
    return apiResponse.internalError('Device management failed')
  }
}

// Get device management options for a screen
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await authenticateUser(request)
    const { searchParams } = new URL(request.url)
    const screen_id = searchParams.get('screen_id')

    if (!screen_id) {
      return apiResponse.badRequest('screen_id parameter is required')
    }

    // Get screen and verify access
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        *,
        location:locations (
          id,
          name,
          district:districts (
            id, 
            name,
            organization_id
          )
        )
      `)
      .eq('id', screen_id)
      .single()

    if (screenError || !screen) {
      return apiResponse.notFound('Screen not found')
    }

    // Verify user has access
    const { data: hasAccess } = await supabase
      .rpc('user_can_access_location', {
        user_id: user.id,
        location_id: screen.location_id
      })

    if (!hasAccess) {
      return apiResponse.unauthorized('Access denied to this screen')
    }

    // Get recent logs
    const { data: recentLogs } = await supabase
      .from('device_sync_log')
      .select('*')
      .eq('screen_id', screen_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const availableActions = []
    
    if (screen.device_token) {
      availableActions.push(
        { action: 'restart', label: 'Restart Device', description: 'Restart the Pi device' },
        { action: 'force_sync', label: 'Force Sync', description: 'Trigger immediate content sync' },
        { action: 'unpair', label: 'Unpair Device', description: 'Remove device pairing', destructive: true }
      )
    }
    
    availableActions.push(
      { action: 'get_logs', label: 'View Logs', description: 'Show device activity logs' },
      { action: 'get_status', label: 'Check Status', description: 'Get current device status' }
    )

    return apiResponse.success({
      screen: {
        id: screen.id,
        name: screen.name,
        device_id: screen.device_id,
        device_status: screen.device_status,
        device_token: !!screen.device_token,
        last_seen: screen.last_seen,
        last_sync_at: screen.last_sync_at,
        location: screen.location
      },
      available_actions: availableActions,
      recent_logs: recentLogs || []
    })

  } catch (error) {
    console.error('Get device management error:', error)
    return apiResponse.internalError('Failed to get device management options')
  }
}