import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { action, screen_id, device_id } = await request.json()

    if (!action || !screen_id) {
      return NextResponse.json({ error: 'Action and screen_id are required' }, { status: 400 })
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
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Verify user has access to this screen
    const { data: hasAccess } = await supabase
      .rpc('user_can_access_location', {
        user_id: user.id,
        location_id: screen.location_id
      })

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to this screen' }, { status: 403 })
    }

    switch (action) {
      case 'restart':
        // Queue restart command using the new command system
        const { data: restartCommand, error: restartError } = await supabase
          .from('device_commands')
          .insert({
            device_id: device_id,
            screen_id: screen_id,
            command_type: 'restart',
            command_data: { source: 'management_api' },
            priority: 2, // High priority
            created_by: user.id
          })
          .select()
          .single()

        if (restartError) {
          console.error('Error queuing restart command:', restartError)
          return NextResponse.json({ error: 'Failed to queue restart command' }, { status: 500 })
        }

        // Log the command queuing activity
        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'command_queued',
            details: {
              command_id: restartCommand.id,
              command_type: 'restart',
              requested_by: user.id,
              requested_at: new Date().toISOString(),
              device_id: device_id
            }
          })

        return NextResponse.json({
          message: 'Restart command queued successfully',
          action: 'restart',
          command_id: restartCommand.id,
          screen_id: screen_id,
          device_id: device_id,
          status: 'pending'
        })

      case 'force_sync':
        // Queue sync command using the new command system
        const { data: syncCommand, error: syncError } = await supabase
          .from('device_commands')
          .insert({
            device_id: device_id,
            screen_id: screen_id,
            command_type: 'sync_content',
            command_data: { source: 'management_api', force: true },
            priority: 3, // Normal-high priority
            created_by: user.id
          })
          .select()
          .single()

        if (syncError) {
          console.error('Error queuing sync command:', syncError)
          return NextResponse.json({ error: 'Failed to queue sync command' }, { status: 500 })
        }

        // Log the command queuing activity
        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'command_queued',
            details: {
              command_id: syncCommand.id,
              command_type: 'sync_content',
              requested_by: user.id,
              requested_at: new Date().toISOString(),
              device_id: device_id
            }
          })

        return NextResponse.json({
          message: 'Force sync command queued successfully',
          action: 'force_sync',
          command_id: syncCommand.id,
          screen_id: screen_id,
          device_id: device_id,
          status: 'pending'
        })

      case 'reboot':
        // Queue reboot command
        const { data: rebootCommand, error: rebootError } = await supabase
          .from('device_commands')
          .insert({
            device_id: device_id,
            screen_id: screen_id,
            command_type: 'reboot',
            command_data: { source: 'management_api' },
            priority: 1, // Highest priority
            timeout_seconds: 600, // 10 minutes timeout for reboot
            created_by: user.id
          })
          .select()
          .single()

        if (rebootError) {
          console.error('Error queuing reboot command:', rebootError)
          return NextResponse.json({ error: 'Failed to queue reboot command' }, { status: 500 })
        }

        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'command_queued',
            details: {
              command_id: rebootCommand.id,
              command_type: 'reboot',
              requested_by: user.id,
              device_id: device_id
            }
          })

        return NextResponse.json({
          message: 'Reboot command queued successfully',
          action: 'reboot',
          command_id: rebootCommand.id,
          status: 'pending',
          warning: 'Device will be unavailable during reboot'
        })

      case 'clear_cache':
        // Queue clear cache command
        const { data: cacheCommand, error: cacheError } = await supabase
          .from('device_commands')
          .insert({
            device_id: device_id,
            screen_id: screen_id,
            command_type: 'clear_cache',
            command_data: { source: 'management_api' },
            priority: 4, // Normal priority
            created_by: user.id
          })
          .select()
          .single()

        if (cacheError) {
          console.error('Error queuing clear cache command:', cacheError)
          return NextResponse.json({ error: 'Failed to queue clear cache command' }, { status: 500 })
        }

        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'command_queued',
            details: {
              command_id: cacheCommand.id,
              command_type: 'clear_cache',
              requested_by: user.id,
              device_id: device_id
            }
          })

        return NextResponse.json({
          message: 'Clear cache command queued successfully',
          action: 'clear_cache',
          command_id: cacheCommand.id,
          status: 'pending'
        })

      case 'health_check':
        // Queue health check command
        const { data: healthCommand, error: healthError } = await supabase
          .from('device_commands')
          .insert({
            device_id: device_id,
            screen_id: screen_id,
            command_type: 'health_check',
            command_data: { source: 'management_api' },
            priority: 5, // Normal priority
            created_by: user.id
          })
          .select()
          .single()

        if (healthError) {
          console.error('Error queuing health check command:', healthError)
          return NextResponse.json({ error: 'Failed to queue health check command' }, { status: 500 })
        }

        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen_id,
            activity: 'command_queued',
            details: {
              command_id: healthCommand.id,
              command_type: 'health_check',
              requested_by: user.id,
              device_id: device_id
            }
          })

        return NextResponse.json({
          message: 'Health check command queued successfully',
          action: 'health_check',
          command_id: healthCommand.id,
          status: 'pending'
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
          return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
        }

        return NextResponse.json({
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
          return NextResponse.json({ error: 'Failed to get device status' }, { status: 500 })
        }

        return NextResponse.json({
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
          return NextResponse.json({ error: 'Failed to unpair device' }, { status: 500 })
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

        return NextResponse.json({
          message: 'Device unpaired successfully',
          action: 'unpair',
          screen_id: screen_id
        })

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }

  } catch (error) {
    console.error('Device management error:', error)
    return NextResponse.json({ error: 'Device management failed' }, { status: 500 })
  }
}

// Get device management options for a screen
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const screen_id = searchParams.get('screen_id')

    if (!screen_id) {
      return NextResponse.json({ error: 'screen_id parameter is required' }, { status: 400 })
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
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }

    // Verify user has access
    const { data: hasAccess } = await supabase
      .rpc('user_can_access_location', {
        user_id: user.id,
        location_id: screen.location_id
      })

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to this screen' }, { status: 403 })
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
        { action: 'restart', label: 'Restart Service', description: 'Restart the Pi client service', icon: 'refresh' },
        { action: 'reboot', label: 'Reboot Device', description: 'Reboot the entire Pi device', icon: 'power', destructive: true },
        { action: 'force_sync', label: 'Force Sync', description: 'Trigger immediate content sync', icon: 'sync' },
        { action: 'clear_cache', label: 'Clear Cache', description: 'Clear media cache and re-download content', icon: 'trash' },
        { action: 'health_check', label: 'Health Check', description: 'Run system health diagnostics', icon: 'heart' },
        { action: 'unpair', label: 'Unpair Device', description: 'Remove device pairing', icon: 'unlink', destructive: true }
      )
    }
    
    availableActions.push(
      { action: 'get_logs', label: 'View Logs', description: 'Show device activity logs' },
      { action: 'get_status', label: 'Check Status', description: 'Get current device status' }
    )

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Failed to get device management options' }, { status: 500 })
  }
}