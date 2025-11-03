import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft-graph'

/**
 * Initiate Microsoft OAuth Flow
 * Redirects user to Microsoft login to authorize calendar access
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const screenId = searchParams.get('screen_id')

    if (!screenId) {
      return NextResponse.json({
        error: 'Missing screen_id parameter'
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this screen
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
      return NextResponse.json({
        error: 'Screen not found or access denied'
      }, { status: 404 })
    }

    // Get Microsoft OAuth credentials from environment
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback`

    if (!clientId) {
      console.error('Missing MICROSOFT_CLIENT_ID environment variable')
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 })
    }

    // Generate OAuth authorization URL
    // Use screen_id as state parameter to link the calendar connection
    const authUrl = getMicrosoftAuthUrl(clientId, redirectUri, screenId)

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
