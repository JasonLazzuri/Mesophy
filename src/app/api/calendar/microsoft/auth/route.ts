import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft-graph'

/**
 * Initiate Microsoft OAuth Flow
 * Redirects user to Microsoft login to authorize calendar access
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [AUTH] Starting Microsoft OAuth flow')

    const searchParams = request.nextUrl.searchParams
    const screenId = searchParams.get('screen_id')

    console.log('🔵 [AUTH] Screen ID:', screenId)

    if (!screenId) {
      console.error('❌ [AUTH] Missing screen_id parameter')
      return NextResponse.json({
        error: 'Missing screen_id parameter'
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    console.log('🔵 [AUTH] Verifying user authentication...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('❌ [AUTH] User not authenticated:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ [AUTH] User authenticated:', user.id)

    // Verify user has access to this screen
    console.log('🔵 [AUTH] Verifying screen access...')
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        locations (
          id,
          districts (
            organization_id
          )
        )
      `)
      .eq('id', screenId)
      .single()

    if (screenError || !screen) {
      console.error('❌ [AUTH] Screen not found or access denied:', screenError)
      return NextResponse.json({
        error: 'Screen not found or access denied'
      }, { status: 404 })
    }

    console.log('✅ [AUTH] Screen access verified:', screen.name)

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback`

    console.log('🔵 [AUTH] OAuth configuration:', {
      hasClientId: !!clientId,
      redirectUri,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL
    })

    if (!clientId) {
      console.error('❌ [AUTH] Missing MICROSOFT_CLIENT_ID environment variable')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Generate OAuth authorization URL
    // Use screen_id as state parameter to link the calendar connection
    const authUrl = getMicrosoftAuthUrl(clientId, redirectUri, screenId)

    console.log('✅ [AUTH] Generated auth URL:', authUrl)
    console.log('✅ [AUTH] Redirecting to Microsoft login...')

    // Redirect user to Microsoft login
    return NextResponse.redirect(authUrl)

  } catch (error) {
    console.error('Microsoft auth initiation error:', error)
    return NextResponse.json({
      error: 'Failed to initiate Microsoft authentication',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
