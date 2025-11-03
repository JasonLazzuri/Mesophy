import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftGraphClient, refreshAccessToken } from '@/lib/microsoft-graph'

/**
 * Get calendar connection for a screen
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { screenId: string } }
) {
  try {
    const supabase = await createClient()
    const screenId = params.screenId

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get calendar connection for this screen
    const { data: connection, error: connectionError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('screen_id', screenId)
      .maybeSingle()

    if (connectionError) {
      throw connectionError
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
        message: 'No calendar connection found for this screen'
      })
    }

    // Return connection info (without sensitive tokens)
    return NextResponse.json({
      connected: true,
      connection: {
        id: connection.id,
        provider: connection.provider,
        calendar_id: connection.calendar_id,
        calendar_name: connection.calendar_name,
        microsoft_email: connection.microsoft_email,
        is_active: connection.is_active,
        sync_status: connection.sync_status,
        last_sync_at: connection.last_sync_at,
        last_sync_error: connection.last_sync_error,
        timezone: connection.timezone,
        business_hours_start: connection.business_hours_start,
        business_hours_end: connection.business_hours_end
      }
    })

  } catch (error) {
    console.error('Error fetching calendar connection:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendar connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Update calendar connection (select calendar, update settings)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { screenId: string } }
) {
  try {
    const supabase = await createClient()
    const screenId = params.screenId
    const body = await request.json()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get existing connection
    const { data: connection, error: fetchError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('screen_id', screenId)
      .single()

    if (fetchError || !connection) {
      return NextResponse.json({
        error: 'Calendar connection not found'
      }, { status: 404 })
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (body.calendar_id !== undefined) {
      updateData.calendar_id = body.calendar_id
    }

    if (body.calendar_name !== undefined) {
      updateData.calendar_name = body.calendar_name
      updateData.sync_status = 'active' // Activate sync when calendar is selected
    }

    if (body.timezone !== undefined) {
      updateData.timezone = body.timezone
    }

    if (body.business_hours_start !== undefined) {
      updateData.business_hours_start = body.business_hours_start
    }

    if (body.business_hours_end !== undefined) {
      updateData.business_hours_end = body.business_hours_end
    }

    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active
    }

    if (body.show_organizer !== undefined) {
      updateData.show_organizer = body.show_organizer
    }

    if (body.show_attendees !== undefined) {
      updateData.show_attendees = body.show_attendees
    }

    // Update connection
    const { data: updated, error: updateError } = await supabase
      .from('calendar_connections')
      .update(updateData)
      .eq('id', connection.id)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: updated.id,
        calendar_id: updated.calendar_id,
        calendar_name: updated.calendar_name,
        is_active: updated.is_active,
        sync_status: updated.sync_status
      }
    })

  } catch (error) {
    console.error('Error updating calendar connection:', error)
    return NextResponse.json({
      error: 'Failed to update calendar connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Delete calendar connection
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { screenId: string } }
) {
  try {
    const supabase = await createClient()
    const screenId = params.screenId

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete connection
    const { error: deleteError } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('screen_id', screenId)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({
      success: true,
      message: 'Calendar connection deleted'
    })

  } catch (error) {
    console.error('Error deleting calendar connection:', error)
    return NextResponse.json({
      error: 'Failed to delete calendar connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
