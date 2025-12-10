import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get Latest OAuth Session
 * Fetches the most recent non-expired OAuth session for the authenticated user
 * Used after OAuth callback to retrieve session without exposing session_id in URL
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔵 [LATEST_SESSION] Fetching latest OAuth session')

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('❌ [LATEST_SESSION] User not authenticated')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ [LATEST_SESSION] User authenticated:', user.id)

    // Fetch latest non-expired OAuth session for this user
    const { data: session, error: sessionError } = await supabase
      .from('calendar_oauth_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString()) // Only non-expired sessions
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      console.error('❌ [LATEST_SESSION] Database error:', sessionError)
      return NextResponse.json({
        error: 'Failed to fetch OAuth session',
        details: sessionError.message
      }, { status: 500 })
    }

    if (!session) {
      console.log('⚠️ [LATEST_SESSION] No active session found')
      return NextResponse.json({
        error: 'No active OAuth session found',
        hint: 'Please reconnect your calendar'
      }, { status: 404 })
    }

    console.log('✅ [LATEST_SESSION] Session found:', session.session_id)

    // Return session data (RLS ensures user can only see their own sessions)
    return NextResponse.json({
      session_id: session.session_id,
      microsoft_email: session.microsoft_email,
      microsoft_display_name: session.microsoft_display_name,
      expires_at: session.expires_at,
      created_at: session.created_at
    })

  } catch (error) {
    console.error('❌ [LATEST_SESSION] Error fetching OAuth session:', error)
    return NextResponse.json({
      error: 'Failed to fetch OAuth session',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
