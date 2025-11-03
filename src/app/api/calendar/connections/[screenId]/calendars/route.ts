import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MicrosoftGraphClient, refreshAccessToken } from '@/lib/microsoft-graph'

/**
 * Get list of available calendars from Microsoft Graph
 * Used after OAuth to let user select which calendar to use
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
      .single()

    if (connectionError || !connection) {
      return NextResponse.json({
        error: 'Calendar connection not found. Please connect to Microsoft first.'
      }, { status: 404 })
    }

    // Check if access token is expired
    let accessToken = connection.access_token
    const tokenExpiresAt = new Date(connection.token_expires_at)
    const now = new Date()

    if (tokenExpiresAt <= now) {
      // Token expired, refresh it
      const clientId = process.env.MICROSOFT_CLIENT_ID!
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!

      try {
        const tokenResponse = await refreshAccessToken(
          connection.refresh_token,
          clientId,
          clientSecret
        )

        accessToken = tokenResponse.access_token

        // Update token in database
        const expiresAt = new Date()
        expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in)

        await supabase
          .from('calendar_connections')
          .update({
            access_token: tokenResponse.access_token,
            refresh_token: tokenResponse.refresh_token || connection.refresh_token,
            token_expires_at: expiresAt.toISOString()
          })
          .eq('id', connection.id)

      } catch (refreshError) {
        console.error('Failed to refresh access token:', refreshError)
        return NextResponse.json({
          error: 'Failed to refresh access token. Please reconnect to Microsoft.',
          reconnect_required: true
        }, { status: 401 })
      }
    }

    // Fetch calendars from Microsoft Graph
    const graphClient = new MicrosoftGraphClient(accessToken)
    const calendars = await graphClient.getCalendars()

    return NextResponse.json({
      success: true,
      calendars: calendars.map(cal => ({
        id: cal.id,
        name: cal.name,
        owner: cal.owner
      }))
    })

  } catch (error) {
    console.error('Error fetching calendars:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendars from Microsoft',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
