import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftGraphClient, refreshAccessToken } from '@/lib/microsoft-graph'

/**
 * Get calendar events for a device's screen
 * Called by Android TV devices to display room availability
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const supabase = await createClient()
    const deviceId = params.deviceId

    // Authenticate device using Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deviceToken = authHeader.substring(7)

    // Get device and associated screen
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        device_token,
        locations (
          timezone
        )
      `)
      .eq('device_id', deviceId)
      .eq('device_token', deviceToken)
      .single()

    if (screenError || !screen) {
      return NextResponse.json({
        error: 'Device not found or invalid token'
      }, { status: 404 })
    }

    // Get calendar connection for this screen
    const { data: connection, error: connectionError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('screen_id', screen.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({
        connected: false,
        message: 'No active calendar connection for this screen'
      })
    }

    if (!connection.calendar_id) {
      return NextResponse.json({
        connected: true,
        calendar_selected: false,
        message: 'Calendar connected but no calendar selected'
      })
    }

    // Check if access token is expired and refresh if needed
    let accessToken = connection.access_token
    const tokenExpiresAt = new Date(connection.token_expires_at)
    const now = new Date()

    if (tokenExpiresAt <= now) {
      const clientId = process.env.MICROSOFT_CLIENT_ID!
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!

      try {
        const tokenResponse = await refreshAccessToken(
          connection.refresh_token,
          clientId,
          clientSecret
        )

        accessToken = tokenResponse.access_token

        const expiresAt = new Date()
        expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in)

        await supabase
          .from('calendar_connections')
          .update({
            access_token: tokenResponse.access_token,
            refresh_token: tokenResponse.refresh_token || connection.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            last_sync_at: new Date().toISOString()
          })
          .eq('id', connection.id)

      } catch (refreshError) {
        console.error('Failed to refresh token for device calendar:', refreshError)

        await supabase
          .from('calendar_connections')
          .update({
            sync_status: 'error',
            last_sync_error: 'Token refresh failed'
          })
          .eq('id', connection.id)

        return NextResponse.json({
          error: 'Failed to refresh calendar access. Please reconnect.',
          reconnect_required: true
        }, { status: 401 })
      }
    }

    // Fetch calendar events from Microsoft Graph
    const graphClient = new MicrosoftGraphClient(accessToken)
    const timezone = screen.locations?.timezone || connection.timezone || 'UTC'

    const { currentEvent, nextEvent } = await graphClient.getCurrentAndNextEvent(
      connection.calendar_id
    )

    // Also get all today's events for displaying full schedule
    const todaysEvents = await graphClient.getTodaysEvents(connection.calendar_id, timezone)

    // Update last sync time
    await supabase
      .from('calendar_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'active',
        last_sync_error: null
      })
      .eq('id', connection.id)

    // Cache events in database for offline access
    if (todaysEvents.length > 0) {
      // Clear today's cached events
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      await supabase
        .from('calendar_events_cache')
        .delete()
        .eq('calendar_connection_id', connection.id)
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())

      // Insert new cached events
      const eventCacheData = todaysEvents
        .filter(event => !event.isCancelled)
        .map(event => ({
          calendar_connection_id: connection.id,
          event_id: event.id,
          subject: event.subject,
          organizer_name: event.organizer?.emailAddress?.name,
          organizer_email: event.organizer?.emailAddress?.address,
          start_time: event.start.dateTime,
          end_time: event.end.dateTime,
          is_all_day: event.isAllDay,
          status: event.isCancelled ? 'cancelled' : 'confirmed',
          is_private: event.sensitivity === 'private' || event.sensitivity === 'confidential',
          location: event.location?.displayName,
          attendees: event.attendees,
          body_preview: event.bodyPreview,
          categories: event.categories
        }))

      if (eventCacheData.length > 0) {
        await supabase
          .from('calendar_events_cache')
          .insert(eventCacheData)
      }
    }

    // Format response for Android TV client
    return NextResponse.json({
      connected: true,
      calendar_selected: true,
      calendar_name: connection.calendar_name,
      timezone: timezone,
      business_hours: {
        start: connection.business_hours_start,
        end: connection.business_hours_end
      },
      current_event: currentEvent ? formatEventForDevice(currentEvent, connection) : null,
      next_event: nextEvent ? formatEventForDevice(nextEvent, connection) : null,
      todays_events: todaysEvents
        .filter(e => !e.isCancelled)
        .map(e => formatEventForDevice(e, connection)),
      last_sync: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching calendar for device:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendar events',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Format calendar event for device display
 * Respects privacy settings
 */
function formatEventForDevice(event: any, connection: any) {
  const isPrivate = event.sensitivity === 'private' || event.sensitivity === 'confidential'

  return {
    id: event.id,
    subject: isPrivate && !connection.show_private_details ? 'Private Meeting' : event.subject,
    start: event.start.dateTime,
    end: event.end.dateTime,
    is_all_day: event.isAllDay,
    organizer: connection.show_organizer && (!isPrivate || connection.show_private_details)
      ? event.organizer?.emailAddress?.name
      : null,
    location: event.location?.displayName,
    is_private: isPrivate
  }
}
