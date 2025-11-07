import { NextRequest, NextResponse } from 'next/server'
import { refreshMicrosoftToken, getMicrosoftCalendarEvents } from '@/lib/microsoft-graph'

/**
 * Calendar Data API for Android TV Devices
 *
 * Fetches live calendar events from Microsoft Graph API
 * Used by room calendar screens to display upcoming meetings
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body with calendar metadata
    const body = await request.json()
    const { calendar_metadata } = body

    if (!calendar_metadata) {
      return NextResponse.json({
        error: 'Calendar metadata required'
      }, { status: 400 })
    }

    console.log('📅 Calendar data request for calendar:', calendar_metadata.calendar_name || calendar_metadata.calendar_id)
    console.log('📅 Token expires at:', calendar_metadata.token_expires_at)
    console.log('📅 Current time:', new Date().toISOString())

    // Check if access token needs refresh
    const tokenExpiresAt = new Date(calendar_metadata.token_expires_at)
    const now = new Date()
    console.log('📅 Token expires at (parsed):', tokenExpiresAt.toISOString())
    console.log('📅 Token expired?', tokenExpiresAt <= now)

    const needsRefresh = tokenExpiresAt <= now

    let accessToken = calendar_metadata.access_token
    let newRefreshToken = calendar_metadata.refresh_token

    if (needsRefresh) {
      console.log('🔄 Access token expired, refreshing...')
      console.log('🔄 Refresh token:', calendar_metadata.refresh_token?.substring(0, 50) + '...')
      try {
        const tokens = await refreshMicrosoftToken(calendar_metadata.refresh_token)
        accessToken = tokens.accessToken
        newRefreshToken = tokens.refreshToken || calendar_metadata.refresh_token

        console.log('✅ Token refreshed successfully')

        // TODO: Update the token in database for next sync
        // For now, we'll just use the new token for this request
      } catch (error) {
        console.error('❌ Failed to refresh token:', error)
        console.error('❌ Error details:', error instanceof Error ? error.message : JSON.stringify(error))

        // Return 401 with a specific error code so Android TV can display appropriate message
        // Portal users will need to re-authenticate the calendar connection
        return NextResponse.json({
          error: 'Calendar authentication expired',
          error_code: 'OAUTH_TOKEN_EXPIRED',
          details: 'Please re-authenticate this calendar in the portal',
          message: 'The calendar connection has expired and needs to be re-authorized. Please visit the portal to reconnect.'
        }, { status: 401 })
      }
    } else {
      console.log('✅ Token still valid, using existing access token')
    }

    // Fetch calendar events
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 1) // Next 24 hours

    console.log(`📅 Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`)

    const events = await getMicrosoftCalendarEvents(
      accessToken,
      calendar_metadata.calendar_id,
      startDate,
      endDate
    )

    console.log(`✅ Retrieved ${events.length} calendar events`)

    // Format events for Android client
    const formattedEvents = events.map(event => ({
      id: event.id,
      subject: event.subject,
      start: event.start.dateTime,
      end: event.end.dateTime,
      timezone: event.start.timeZone || calendar_metadata.timezone,
      organizer: calendar_metadata.show_organizer ? {
        name: event.organizer?.emailAddress?.name,
        email: event.organizer?.emailAddress?.address
      } : null,
      attendees: calendar_metadata.show_attendees ? event.attendees?.map(attendee => ({
        name: attendee.emailAddress?.name,
        email: attendee.emailAddress?.address,
        status: attendee.status?.response
      })) : null,
      location: event.location?.displayName,
      body: event.bodyPreview,
      is_all_day: event.isAllDay,
      is_private: event.sensitivity === 'private',
      show_as: event.showAs, // free, busy, tentative, etc.
      is_cancelled: event.isCancelled
    }))

    return NextResponse.json({
      calendar_id: calendar_metadata.calendar_id,
      calendar_name: calendar_metadata.calendar_name,
      timezone: calendar_metadata.timezone,
      events: formattedEvents,
      fetched_at: new Date().toISOString(),
      token_refreshed: needsRefresh,
      new_access_token: needsRefresh ? accessToken : undefined,
      new_refresh_token: needsRefresh && newRefreshToken !== calendar_metadata.refresh_token ? newRefreshToken : undefined
    })

  } catch (error) {
    console.error('Calendar data fetch error:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendar data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow CORS for device requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
