import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Create Calendar Media Asset
 * Creates a media asset from a Microsoft calendar OAuth session
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔵 [MEDIA_CREATE] Creating calendar media asset')

    const body = await request.json()
    const {
      session_id,
      calendar_id,
      calendar_name,
      media_asset_name,
      folder_id,
      timezone,
      show_organizer,
      show_attendees,
      show_private_details
    } = body

    console.log('🔵 [MEDIA_CREATE] Request params:', {
      session_id,
      calendar_id,
      media_asset_name,
      folder_id
    })

    if (!session_id || !calendar_id || !media_asset_name) {
      console.error('❌ [MEDIA_CREATE] Missing required parameters')
      return NextResponse.json({
        error: 'Missing required parameters: session_id, calendar_id, media_asset_name'
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('❌ [MEDIA_CREATE] User not authenticated')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ [MEDIA_CREATE] User authenticated:', user.id)

    // Fetch OAuth session
    console.log('🔵 [MEDIA_CREATE] Fetching OAuth session:', session_id)
    const { data: session, error: sessionError } = await supabase
      .from('calendar_oauth_sessions')
      .select('*')
      .eq('session_id', session_id)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      console.error('❌ [MEDIA_CREATE] OAuth session not found')
      return NextResponse.json({
        error: 'OAuth session not found or expired'
      }, { status: 404 })
    }

    console.log('✅ [MEDIA_CREATE] OAuth session found')

    // Get user's organization
    console.log('🔵 [MEDIA_CREATE] Fetching user profile for organization')
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('❌ [MEDIA_CREATE] User profile not found')
      return NextResponse.json({
        error: 'User profile not found'
      }, { status: 404 })
    }

    console.log('✅ [MEDIA_CREATE] Organization ID:', profile.organization_id)

    // Prepare calendar metadata
    const calendarMetadata = {
      provider: 'microsoft',
      calendar_id,
      calendar_name,
      timezone: timezone || 'America/Los_Angeles',
      sync_status: 'active',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_expires_at: session.token_expires_at,
      last_token_refresh: new Date().toISOString(),
      microsoft_user_id: session.microsoft_user_id,
      microsoft_email: session.microsoft_email,
      business_hours_start: '08:00:00',
      business_hours_end: '18:00:00',
      show_organizer: show_organizer !== undefined ? show_organizer : true,
      show_attendees: show_attendees !== undefined ? show_attendees : false,
      show_private_details: show_private_details !== undefined ? show_private_details : false,
      migration_date: new Date().toISOString()
    }

    console.log('🔵 [MEDIA_CREATE] Creating media asset...')

    // Create media asset
    const { data: mediaAsset, error: createError } = await supabase
      .from('media_assets')
      .insert({
        organization_id: profile.organization_id,
        folder_id: folder_id || null,
        name: media_asset_name,
        media_type: 'calendar',
        mime_type: 'application/calendar',
        calendar_metadata: calendarMetadata,
        is_active: true,
        created_by: user.id
      })
      .select()
      .single()

    if (createError) {
      console.error('❌ [MEDIA_CREATE] Failed to create media asset:', createError)
      return NextResponse.json({
        error: 'Failed to create media asset',
        details: createError.message
      }, { status: 500 })
    }

    console.log('✅ [MEDIA_CREATE] Media asset created:', mediaAsset.id)

    // Clean up OAuth session
    console.log('🔵 [MEDIA_CREATE] Cleaning up OAuth session')
    await supabase
      .from('calendar_oauth_sessions')
      .delete()
      .eq('session_id', session_id)

    console.log('✅ [MEDIA_CREATE] OAuth session cleaned up')

    return NextResponse.json({
      success: true,
      media_asset: {
        id: mediaAsset.id,
        name: mediaAsset.name,
        media_type: mediaAsset.media_type
      }
    })

  } catch (error) {
    console.error('❌ [MEDIA_CREATE] Error creating calendar media asset:', error)
    return NextResponse.json({
      error: 'Failed to create calendar media asset',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
