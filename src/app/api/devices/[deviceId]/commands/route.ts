import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface RouteParams {
  params: {
    deviceId: string
  }
}

interface QueueCommandRequest {
  command_type: string
  command_data?: any
  priority?: number
  timeout_seconds?: number
  scheduled_for?: string
}

interface UpdateCommandRequest {
  command_id: string
  status: 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: any
  error_message?: string
}

// GET: Pi device polls for pending commands
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Use admin client for device operations to bypass RLS
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { deviceId } = params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')

    console.log(`Polling commands for device: ${deviceId}`)

    // Get pending commands using the database function
    const { data: commands, error } = await supabase
      .rpc('get_pending_commands', {
        target_device_id: deviceId,
        command_limit: limit
      })

    if (error) {
      console.error('Error fetching commands:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch commands',
        commands: []
      }, { status: 500 })
    }

    // Update the commands to 'executing' status if any are returned
    if (commands && commands.length > 0) {
      const commandIds = commands.map(cmd => cmd.id)
      const { error: updateError } = await supabase
        .from('device_commands')
        .update({ 
          status: 'executing',
          started_at: new Date().toISOString()
        })
        .in('id', commandIds)

      if (updateError) {
        console.error('Error updating command status:', updateError)
      } else {
        console.log(`Marked ${commandIds.length} commands as executing for device ${deviceId}`)
      }
    }

    return NextResponse.json({
      success: true,
      device_id: deviceId,
      commands: commands || [],
      count: commands?.length || 0
    })

  } catch (error) {
    console.error('Command polling error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// POST: Queue a new command from the portal
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { deviceId } = params
    const body: QueueCommandRequest = await request.json()

    const {
      command_type,
      command_data = {},
      priority = 5,
      timeout_seconds = 300,
      scheduled_for
    } = body

    if (!command_type) {
      return NextResponse.json({ 
        error: 'command_type is required' 
      }, { status: 400 })
    }

    // Validate command type
    const validCommands = [
      'restart', 'reboot', 'shutdown', 'update_playlist', 'sync_content',
      'update_config', 'clear_cache', 'emergency_message', 'test_display',
      'get_logs', 'health_check'
    ]

    if (!validCommands.includes(command_type)) {
      return NextResponse.json({ 
        error: `Invalid command_type. Must be one of: ${validCommands.join(', ')}` 
      }, { status: 400 })
    }

    // Get screen information to verify access
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        location_id,
        locations!inner (
          name,
          district_id,
          districts!inner (
            name,
            organization_id
          )
        )
      `)
      .eq('device_id', deviceId)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({ 
        error: 'Device not found or not accessible' 
      }, { status: 404 })
    }

    // Check user profile and permissions
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, organization_id, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ 
        error: 'User profile not found' 
      }, { status: 403 })
    }

    // Super admins have access to all devices
    if (userProfile.role !== 'super_admin') {
      // For non-super admins, check if they have access to this device's location
      try {
        if (userProfile.role === 'district_manager') {
          // District managers can access devices in their district
          const screenDistrict = screen.locations?.districts
          if (!screenDistrict || userProfile.district_id !== screenDistrict.id) {
            return NextResponse.json({ 
              error: 'Access denied to this device' 
            }, { status: 403 })
          }
        } else if (userProfile.role === 'location_manager') {
          // Location managers can only access devices in their location
          if (userProfile.location_id !== screen.location_id) {
            return NextResponse.json({ 
              error: 'Access denied to this device' 
            }, { status: 403 })
          }
        } else {
          // Unknown role
          return NextResponse.json({ 
            error: 'Access denied to this device' 
          }, { status: 403 })
        }
      } catch (permissionError) {
        console.error('Permission check error:', permissionError)
        return NextResponse.json({ 
          error: 'Permission check failed' 
        }, { status: 500 })
      }
    }

    // Queue the command
    try {
      console.log('Attempting to insert command:', {
        device_id: deviceId,
        screen_id: screen.id,
        command_type,
        command_data,
        priority,
        timeout_seconds,
        user_id: user.id
      })

      const { data: command, error: insertError } = await supabase
        .from('device_commands')
        .insert({
          device_id: deviceId,
          screen_id: screen.id,
          command_type,
          command_data,
          priority,
          timeout_seconds,
          scheduled_for: scheduled_for ? new Date(scheduled_for).toISOString() : new Date().toISOString(),
          created_by: user.id
        })
        .select()
        .single()

      if (insertError) {
        console.error('Database insert error:', insertError)
        return NextResponse.json({ 
          error: 'Failed to queue command',
          details: insertError.message 
        }, { status: 500 })
      }

      console.log('Command successfully queued:', command)

      // Log the command queuing activity
      try {
        await supabase
          .from('device_sync_log')
          .insert({
            screen_id: screen.id,
            activity: 'command_queued',
            details: {
              command_id: command.id,
              command_type,
              device_id: deviceId,
              queued_by: user.id,
              priority,
              scheduled_for: command.scheduled_for
            }
          })
      } catch (logError) {
        console.warn('Failed to log command queuing activity:', logError)
        // Don't fail the request if logging fails
      }

      console.log(`Command queued: ${command_type} for device ${deviceId} by user ${user.id}`)

      return NextResponse.json({
        success: true,
        message: 'Command queued successfully',
        command: {
          id: command.id,
          command_type: command.command_type,
          status: command.status,
          priority: command.priority,
          scheduled_for: command.scheduled_for,
          created_at: command.created_at
        }
      })

    } catch (dbError) {
      console.error('Database operation failed:', dbError)
      return NextResponse.json({ 
        error: 'Database operation failed',
        details: dbError instanceof Error ? dbError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Command queue error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// PUT: Update command status (used by Pi device to report execution results)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Use admin client for device operations to bypass RLS
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { deviceId } = params
    const body: UpdateCommandRequest = await request.json()

    const {
      command_id,
      status,
      result = {},
      error_message
    } = body

    if (!command_id || !status) {
      return NextResponse.json({ 
        error: 'command_id and status are required' 
      }, { status: 400 })
    }

    // Validate status
    const validStatuses = ['executing', 'completed', 'failed', 'cancelled']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      }, { status: 400 })
    }

    // Update the command
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (status === 'executing') {
      updateData.started_at = new Date().toISOString()
    }

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      updateData.completed_at = new Date().toISOString()
      updateData.result = result
      if (error_message) {
        updateData.error_message = error_message
      }
    }

    const { data: command, error: updateError } = await supabase
      .from('device_commands')
      .update(updateData)
      .eq('id', command_id)
      .eq('device_id', deviceId) // Security: ensure device can only update its own commands
      .select()
      .single()

    if (updateError) {
      console.error('Error updating command:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update command' 
      }, { status: 500 })
    }

    if (!command) {
      return NextResponse.json({ 
        error: 'Command not found or not owned by this device' 
      }, { status: 404 })
    }

    // Log the command execution activity
    if (command.screen_id) {
      await supabase
        .from('device_sync_log')
        .insert({
          screen_id: command.screen_id,
          activity: status === 'completed' ? 'command_executed' : 'command_failed',
          details: {
            command_id: command.id,
            command_type: command.command_type,
            device_id: deviceId,
            status,
            result,
            error_message,
            execution_duration: command.started_at ? 
              Math.round((new Date().getTime() - new Date(command.started_at).getTime()) / 1000) : null
          }
        })
    }

    console.log(`Command ${command_id} updated to ${status} by device ${deviceId}`)

    return NextResponse.json({
      success: true,
      message: 'Command status updated successfully',
      command: {
        id: command.id,
        command_type: command.command_type,
        status: command.status,
        started_at: command.started_at,
        completed_at: command.completed_at,
        result: command.result
      }
    })

  } catch (error) {
    console.error('Command update error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// DELETE: Cancel pending commands
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { deviceId } = params
    const { searchParams } = new URL(request.url)
    const commandId = searchParams.get('command_id')

    if (commandId) {
      // Cancel a specific command
      const { data: command, error: updateError } = await supabase
        .from('device_commands')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: `Cancelled by user ${user.id}`
        })
        .eq('id', commandId)
        .eq('device_id', deviceId)
        .eq('status', 'pending')
        .select()
        .single()

      if (updateError || !command) {
        return NextResponse.json({ 
          error: 'Command not found or cannot be cancelled' 
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        message: 'Command cancelled successfully',
        cancelled_command: command.id
      })
    } else {
      // Cancel all pending commands for the device
      const { data: cancelledCommands, error: cancelError } = await supabase
        .from('device_commands')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: `Cancelled by user ${user.id}`
        })
        .eq('device_id', deviceId)
        .eq('status', 'pending')
        .select('id')

      if (cancelError) {
        console.error('Error cancelling commands:', cancelError)
        return NextResponse.json({ 
          error: 'Failed to cancel commands' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `${cancelledCommands?.length || 0} commands cancelled successfully`,
        cancelled_count: cancelledCommands?.length || 0
      })
    }

  } catch (error) {
    console.error('Command cancellation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}