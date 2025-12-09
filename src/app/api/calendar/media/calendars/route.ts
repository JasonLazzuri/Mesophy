import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftCalendars } from '@/lib/microsoft-graph'

/**
 * List Available Microsoft Calendars for Media
 * Retrieves calendars using OAuth tokens from a temporary session
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [MEDIA_CALENDARS] Fetching calendars list')

    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      console.error('❌ [MEDIA_CALENDARS] Missing session_id parameter')
      return NextResponse.json({
        error: 'Missing session_id parameter'
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('❌ [MEDIA_CALENDARS] User not authenticated')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ [MEDIA_CALENDARS] User authenticated:', user.id)

    // Fetch OAuth session
    console.log('🔵 [MEDIA_CALENDARS] Fetching OAuth session:', sessionId)
    const { data: session, error: sessionError } = await supabase
      .from('calendar_oauth_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      console.error('❌ [MEDIA_CALENDARS] OAuth session not found or expired')
      return NextResponse.json({
        error: 'OAuth session not found or expired',
        reconnect_required: true
      }, { status: 404 })
    }

    // Check if session has expired
    const sessionExpiry = new Date(session.expires_at)
    if (sessionExpiry < new Date()) {
      console.error('❌ [MEDIA_CALENDARS] OAuth session expired')
      return NextResponse.json({
        error: 'OAuth session expired',
        reconnect_required: true
      }, { status: 401 })
    }

    console.log('✅ [MEDIA_CALENDARS] OAuth session found')

    // Check if access token has expired
    const tokenExpiry = new Date(session.token_expires_at)
    let accessToken = session.access_token

    if (tokenExpiry < new Date()) {
      console.log('🔄 [MEDIA_CALENDARS] Access token expired, needs refresh')
      // TODO: Implement token refresh
      // For now, return error asking to reconnect
      return NextResponse.json({
        error: 'Access token expired',
        reconnect_required: true
      }, { status: 401 })
    }

    // Fetch calendars from Microsoft Graph
    console.log('🔵 [MEDIA_CALENDARS] Fetching calendars from Microsoft Graph')
    const calendars = await getMicrosoftCalendars(accessToken)

    console.log('✅ [MEDIA_CALENDARS] Retrieved', calendars.length, 'calendars')

    return NextResponse.json({
      calendars: calendars.map(cal => ({
        id: cal.id,
        name: cal.name,
        owner: cal.owner
      }))
    })

  } catch (error) {
    console.error('❌ [MEDIA_CALENDARS] Error fetching calendars:', error)
    return NextResponse.json({
      error: 'Failed to fetch calendars',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
