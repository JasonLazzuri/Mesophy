import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeCodeForToken,
  getMicrosoftUserProfile
} from '@/lib/microsoft-graph'

/**
 * Microsoft OAuth Callback Handler
 * Handles the OAuth redirect from Microsoft after user authorizes calendar access
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [CALLBACK] Route hit - starting OAuth callback processing')
    console.log('🔵 [CALLBACK] Full URL:', request.url)

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // Contains screen_id
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Log ALL query parameters for debugging
    const allParams: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      allParams[key] = value
    })
    console.log('🔵 [CALLBACK] All query params:', allParams)

    console.log('🔵 [CALLBACK] Parsed params:', {
      hasCode: !!code,
      codeLength: code?.length,
      state,
      error,
      errorDescription
    })

    if (error) {
      console.error('❌ [CALLBACK] Microsoft OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/dashboard/screens?calendar_error=${error}`, request.url)
      )
    }

    if (!code || !state) {
      console.error('❌ [CALLBACK] Missing code or state')
      return NextResponse.json({
        error: 'Missing authorization code or state'
      }, { status: 400 })
    }

    // Decode state to get screen_id
    const screenId = state
    console.log('🔵 [CALLBACK] Screen ID from state:', screenId)

    const supabase = await createClient()

    // Get current user
    console.log('🔵 [CALLBACK] Fetching authenticated user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('❌ [CALLBACK] Auth error:', authError)
      return NextResponse.redirect(
        new URL('/login?error=unauthorized', request.url)
      )
    }

    if (!user) {
      console.error('❌ [CALLBACK] No user found')
      return NextResponse.redirect(
        new URL('/login?error=unauthorized', request.url)
      )
    }

    console.log('✅ [CALLBACK] User authenticated:', user.id)

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback`

    console.log('🔵 [CALLBACK] OAuth config:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri
    })

    if (!clientId || !clientSecret) {
      console.error('❌ [CALLBACK] Missing Microsoft OAuth credentials in environment variables')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Exchange authorization code for access token
    console.log('🔵 [CALLBACK] Exchanging code for token...')
    const tokenResponse = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri
    )
    console.log('✅ [CALLBACK] Token exchange successful:', {
      hasAccessToken: !!tokenResponse.access_token,
      hasRefreshToken: !!tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in
    })

    // Get user profile from Microsoft Graph
    console.log('🔵 [CALLBACK] Fetching Microsoft user profile...')
    const userProfile = await getMicrosoftUserProfile(tokenResponse.access_token)
    console.log('✅ [CALLBACK] User profile fetched:', {
      id: userProfile.id,
      email: userProfile.mail || userProfile.userPrincipalName
    })

    // Calculate token expiration time
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in)
    console.log('🔵 [CALLBACK] Token expires at:', expiresAt.toISOString())

    // Store or update calendar connection in database
    console.log('🔵 [CALLBACK] Checking for existing connection...')
    const { data: existingConnection, error: fetchError } = await supabase
      .from('calendar_connections')
      .select('id')
      .eq('screen_id', screenId)
      .maybeSingle()

    if (fetchError) {
      console.error('❌ [CALLBACK] Error fetching existing connection:', fetchError)
      throw fetchError
    }

    console.log('🔵 [CALLBACK] Existing connection:', existingConnection)

    if (existingConnection) {
      // Update existing connection
      console.log('🔵 [CALLBACK] Updating existing connection:', existingConnection.id)
      const { data: updateData, error: updateError } = await supabase
        .from('calendar_connections')
        .update({
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          microsoft_user_id: userProfile.id,
          microsoft_email: userProfile.mail || userProfile.userPrincipalName,
          is_active: true,
          sync_status: 'active',
          last_sync_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConnection.id)
        .select()

      if (updateError) {
        console.error('❌ [CALLBACK] Error updating calendar connection:', updateError)
        throw updateError
      }
      console.log('✅ [CALLBACK] Connection updated successfully:', updateData)
    } else {
      // Create new connection
      console.log('🔵 [CALLBACK] Creating new connection for screen:', screenId)
      const connectionData = {
        screen_id: screenId,
        provider: 'microsoft',
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        microsoft_user_id: userProfile.id,
        microsoft_email: userProfile.mail || userProfile.userPrincipalName,
        is_active: true,
        sync_status: 'pending',
        created_by: user.id
      }
      console.log('🔵 [CALLBACK] Connection data to insert:', {
        ...connectionData,
        access_token: '***',
        refresh_token: '***'
      })

      const { data: insertData, error: insertError } = await supabase
        .from('calendar_connections')
        .insert(connectionData)
        .select()

      if (insertError) {
        console.error('❌ [CALLBACK] Error creating calendar connection:', insertError)
        console.error('❌ [CALLBACK] Error details:', JSON.stringify(insertError, null, 2))
        throw insertError
      }
      console.log('✅ [CALLBACK] Connection created successfully:', insertData)
    }

    // Redirect back to dashboard with success message
    const redirectUrl = new URL(`/dashboard/screens/${screenId}?calendar_connected=true`, request.url)
    console.log('✅ [CALLBACK] Redirecting to:', redirectUrl.toString())
    return NextResponse.redirect(redirectUrl)

  } catch (error) {
    console.error('❌ [CALLBACK] Microsoft OAuth callback error:', error)
    console.error('❌ [CALLBACK] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.redirect(
      new URL('/dashboard/screens?calendar_error=connection_failed', request.url)
    )
  }
}
