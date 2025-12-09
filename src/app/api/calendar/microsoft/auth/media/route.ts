import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft-graph'

/**
 * Initiate Microsoft OAuth Flow for Media Calendar
 * Redirects user to Microsoft login to authorize calendar access
 * Used when connecting calendars as media assets
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [MEDIA_AUTH] Starting Microsoft OAuth flow for media calendar')

    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('session_id')
    const returnUrl = searchParams.get('return_url') || '/dashboard/media'

    console.log('🔵 [MEDIA_AUTH] Session ID:', sessionId)
    console.log('🔵 [MEDIA_AUTH] Return URL:', returnUrl)

    if (!sessionId) {
      console.error('❌ [MEDIA_AUTH] Missing session_id parameter')
      return NextResponse.json({
        error: 'Missing session_id parameter'
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    console.log('🔵 [MEDIA_AUTH] Verifying user authentication...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('❌ [MEDIA_AUTH] User not authenticated:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ [MEDIA_AUTH] User authenticated:', user.id)

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback/media`

    console.log('🔵 [MEDIA_AUTH] OAuth configuration:', {
      hasClientId: !!clientId,
      redirectUri,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL
    })

    if (!clientId) {
      console.error('❌ [MEDIA_AUTH] Missing MICROSOFT_CLIENT_ID environment variable')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Generate OAuth authorization URL
    // Use session_id + return_url as state parameter to track this OAuth session
    const state = `${sessionId}|||${returnUrl}`
    const authUrl = getMicrosoftAuthUrl(clientId, redirectUri, state)

    console.log('✅ [MEDIA_AUTH] Generated auth URL')
    console.log('✅ [MEDIA_AUTH] Redirecting to Microsoft login...')

    // Redirect user to Microsoft login
    return NextResponse.redirect(authUrl)

  } catch (error) {
    console.error('Microsoft media auth initiation error:', error)
    return NextResponse.json({
      error: 'Failed to initiate Microsoft authentication',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
