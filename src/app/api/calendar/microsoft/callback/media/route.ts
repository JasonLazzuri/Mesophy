import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeCodeForToken,
  getMicrosoftUserProfile
} from '@/lib/microsoft-graph'

/**
 * Microsoft OAuth Callback Handler for Media Calendars
 * Handles the OAuth redirect from Microsoft after user authorizes calendar access
 * Stores OAuth tokens temporarily for media asset creation
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [MEDIA_CALLBACK] Route hit - starting OAuth callback processing')
    console.log('🔵 [MEDIA_CALLBACK] Full URL:', request.url)

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // Contains session_id|||return_url
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    console.log('🔵 [MEDIA_CALLBACK] Parsed params:', {
      hasCode: !!code,
      state,
      error,
      errorDescription
    })

    if (error) {
      console.error('❌ [MEDIA_CALLBACK] Microsoft OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/dashboard/media?calendar_error=${error}`, request.url)
      )
    }

    if (!code || !state) {
      console.error('❌ [MEDIA_CALLBACK] Missing code or state')
      return NextResponse.json({
        error: 'Missing authorization code or state'
      }, { status: 400 })
    }

    // Parse state to get session_id and return_url
    const [sessionId, returnUrl] = state.split('|||')
    console.log('🔵 [MEDIA_CALLBACK] Session ID:', sessionId)
    console.log('🔵 [MEDIA_CALLBACK] Return URL:', returnUrl)

    const supabase = await createClient()

    // Get current user
    console.log('🔵 [MEDIA_CALLBACK] Fetching authenticated user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('❌ [MEDIA_CALLBACK] User not authenticated')
      return NextResponse.redirect(
        new URL('/login?error=unauthorized', request.url)
      )
    }

    console.log('✅ [MEDIA_CALLBACK] User authenticated:', user.id)

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback/media`

    if (!clientId || !clientSecret) {
      console.error('❌ [MEDIA_CALLBACK] Missing Microsoft OAuth credentials')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Exchange authorization code for access token
    console.log('🔵 [MEDIA_CALLBACK] Exchanging code for token...')
    const tokenResponse = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri
    )

    console.log('✅ [MEDIA_CALLBACK] Token obtained:', {
      hasAccessToken: !!tokenResponse.accessToken,
      hasRefreshToken: !!tokenResponse.refreshToken,
      expiresIn: tokenResponse.expiresIn
    })

    // Get Microsoft user profile
    console.log('🔵 [MEDIA_CALLBACK] Fetching Microsoft user profile...')
    const userProfile = await getMicrosoftUserProfile(tokenResponse.accessToken)

    console.log('✅ [MEDIA_CALLBACK] User profile obtained:', {
      email: userProfile.mail || userProfile.userPrincipalName,
      displayName: userProfile.displayName
    })

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expiresIn * 1000)

    // Store OAuth session data temporarily
    // Use service role to bypass RLS in case user session was lost during OAuth redirect
    console.log('🔵 [MEDIA_CALLBACK] Storing OAuth session...')

    // Create service role client for OAuth session storage
    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: sessionError } = await supabaseAdmin
      .from('calendar_oauth_sessions')
      .upsert({
        session_id: sessionId,
        user_id: user.id,
        access_token: tokenResponse.accessToken,
        refresh_token: tokenResponse.refreshToken,
        token_expires_at: tokenExpiresAt.toISOString(),
        microsoft_user_id: userProfile.id,
        microsoft_email: userProfile.mail || userProfile.userPrincipalName,
        microsoft_display_name: userProfile.displayName,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // Session expires in 30 minutes
      })

    if (sessionError) {
      console.error('❌ [MEDIA_CALLBACK] Failed to store OAuth session:', sessionError)
      return NextResponse.json({
        error: 'Failed to store OAuth session',
        details: sessionError.message
      }, { status: 500 })
    }

    console.log('✅ [MEDIA_CALLBACK] OAuth session stored successfully')

    // Redirect back to media page with session_id
    const redirectUrl = new URL(returnUrl || '/dashboard/media', request.url)
    redirectUrl.searchParams.set('calendar_connected', 'true')
    redirectUrl.searchParams.set('calendar_session_id', sessionId)

    console.log('✅ [MEDIA_CALLBACK] Redirecting to:', redirectUrl.toString())

    return NextResponse.redirect(redirectUrl)

  } catch (error) {
    console.error('❌ [MEDIA_CALLBACK] Microsoft callback error:', error)
    return NextResponse.redirect(
      new URL(`/dashboard/media?calendar_error=${encodeURIComponent('Failed to connect calendar')}`, request.url)
    )
  }
}
