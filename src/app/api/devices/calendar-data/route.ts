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
    // Authenticate device with token
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')

    if (!deviceToken) {
      return NextResponse.json({
        error: 'Device token required'
      }, { status: 401 })
    }

    console.log('📅 Calendar data request from device:', deviceToken?.substring(0, 10) + '...')

    // Use service role client for device operations (bypass RLS)
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    )

    // Verify device exists with this token
    const { data: screen, error: screenError } = await adminSupabase
      .from('screens')
      .select('id, name, device_id')
      .eq('device_token', deviceToken)
      .single()

    if (screenError || !screen) {
      console.error('❌ Invalid device token')
      return NextResponse.json({
        error: 'Invalid device token'
      }, { status: 401 })
    }

    console.log('✅ Device authenticated:', screen.name)

    // Parse request body with calendar metadata
    const body = await request.json()
    let { calendar_metadata } = body

    if (!calendar_metadata) {
      return NextResponse.json({
        error: 'Calendar metadata required'
      }, { status: 400 })
    }

    // Normalize field names - Android sends camelCase, we need snake_case
    if (calendar_metadata.calendarId) {
      calendar_metadata = {
        calendar_id: calendar_metadata.calendarId,
        calendar_name: calendar_metadata.calendarName,
        access_token: calendar_metadata.accessToken,
        refresh_token: calendar_metadata.refreshToken,
        token_expires_at: calendar_metadata.tokenExpiresAt,
        microsoft_user_id: calendar_metadata.microsoftUserId,
        microsoft_email: calendar_metadata.microsoftEmail,
        timezone: calendar_metadata.timezone,
        show_organizer: calendar_metadata.showOrganizer,
        show_attendees: calendar_metadata.showAttendees,
        show_private_details: calendar_metadata.showPrivateDetails,
        ...calendar_metadata // Keep any other fields
      }
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

        // Update tokens in database immediately to prevent future expirations
        const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 60 minutes from now
        console.log('💾 Saving refreshed tokens to database...')
        console.log('💾 New token expires at:', newExpiresAt)

        try {
          // Update media_assets table with new tokens using adminSupabase client
          const { error: updateError } = await adminSupabase
            .from('media_assets')
            .update({
              calendar_metadata: {
                ...calendar_metadata,
                access_token: accessToken,
                refresh_token: newRefreshToken,
                token_expires_at: newExpiresAt,
                last_token_refresh: new Date().toISOString()
              }
            })
            .eq('calendar_metadata->>calendar_id', calendar_metadata.calendar_id)

          if (updateError) {
            console.error('❌ Failed to save tokens to database:', updateError)
          } else {
            console.log('✅ Successfully saved refreshed tokens to database')
          }
        } catch (dbError) {
          console.error('❌ Database update error:', dbError)
          // Continue anyway - we can still use the refreshed token for this request
        }
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
        }, {
          status: 401,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        })
      }
    } else {
      console.log('✅ Token still valid, using existing access token')
    }

    // Fetch calendar events with timezone preference
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 1) // Next 24 hours

    console.log(`📅 Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`)
    console.log(`📅 Calendar timezone: ${calendar_metadata.timezone}`)

    // Pass timezone to get events in the calendar's local time
    const events = await getMicrosoftCalendarEvents(
      accessToken,
      calendar_metadata.calendar_id,
      startDate,
      endDate,
      calendar_metadata.timezone // This tells Microsoft Graph to return times in PST
    )

    console.log(`✅ Retrieved ${events.length} calendar events`)

    // Format events for Android client
    // Microsoft Graph will now return times in the calendar's timezone (PST)
    const formattedEvents = events.map(event => {
      console.log(`📅 Event "${event.subject}": ${event.start.dateTime} (${event.start.timeZone})`)

      return {
        id: event.id,
        subject: event.subject,
        start: event.start.dateTime, // Already in calendar's timezone thanks to Prefer header
        end: event.end.dateTime,     // Already in calendar's timezone thanks to Prefer header
        timezone: calendar_metadata.timezone,
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
      }
    })

    return NextResponse.json({
      calendar_id: calendar_metadata.calendar_id,
      calendar_name: calendar_metadata.calendar_name,
      timezone: calendar_metadata.timezone,
      events: formattedEvents,
      fetched_at: new Date().toISOString(),
      token_refreshed: needsRefresh,
      new_access_token: needsRefresh ? accessToken : undefined,
      new_refresh_token: needsRefresh && newRefreshToken !== calendar_metadata.refresh_token ? newRefreshToken : undefined
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })

  } catch (error) {
    console.error('Calendar data fetch error:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendar data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
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
