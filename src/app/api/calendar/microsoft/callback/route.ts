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
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // Contains screen_id
    const error = searchParams.get('error')

    if (error) {
      console.error('Microsoft OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/dashboard/screens?calendar_error=${error}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.json({
        error: 'Missing authorization code or state'
      }, { status: 400 })
    }

    // Decode state to get screen_id
    const screenId = state

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(
        new URL('/login?error=unauthorized', request.url)
      )
    }

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback`

    if (!clientId || !clientSecret) {
      console.error('Missing Microsoft OAuth credentials in environment variables')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri
    )

    // Get user profile from Microsoft Graph
    const userProfile = await getMicrosoftUserProfile(tokenResponse.access_token)

    // Calculate token expiration time
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in)

    // Store or update calendar connection in database
    const { data: existingConnection, error: fetchError } = await supabase
      .from('calendar_connections')
      .select('id')
      .eq('screen_id', screenId)
      .maybeSingle()

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error('Error updating calendar connection:', updateError)
        throw updateError
      }
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from('calendar_connections')
        .insert({
          screen_id: screenId,
          provider: 'microsoft',
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          microsoft_user_id: userProfile.id,
          microsoft_email: userProfile.mail || userProfile.userPrincipalName,
          is_active: true,
          sync_status: 'pending', // Will be set to 'active' after selecting calendar
          created_by: user.id
        })

      if (insertError) {
        console.error('Error creating calendar connection:', insertError)
        throw insertError
      }
    }

    // Redirect back to dashboard with success message
    return NextResponse.redirect(
      new URL(`/dashboard/screens/${screenId}?calendar_connected=true`, request.url)
    )

  } catch (error) {
    console.error('Microsoft OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/dashboard/screens?calendar_error=connection_failed', request.url)
    )
  }
}
