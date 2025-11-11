import { NextRequest, NextResponse } from 'next/server'
import { refreshMicrosoftToken } from '@/lib/microsoft-graph'

/**
 * Proactive Calendar Token Refresh API
 *
 * This endpoint refreshes OAuth tokens for all active calendar integrations
 * BEFORE they expire, ensuring uninterrupted calendar access.
 *
 * Should be called by a cron job every 30 minutes to maintain fresh tokens.
 *
 * Microsoft OAuth Token Lifecycle:
 * - Access Token: Expires in 60-90 minutes
 * - Refresh Token: Lasts 90 days (or indefinitely with rotation)
 *
 * By refreshing every 30 minutes, we ensure:
 * 1. Access tokens never expire
 * 2. Refresh tokens get rotated regularly
 * 3. Users never need to re-authenticate
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting proactive token refresh for all calendars...')

    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                               process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                               process.env.SUPABASE_SERVICE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase credentials')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Fetch all active calendar media assets
    const response = await fetch(`${supabaseUrl}/rest/v1/media_assets?media_type=eq.calendar&is_active=eq.true&select=*`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('❌ Failed to fetch calendar assets:', response.status)
      return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: 500 })
    }

    const calendars = await response.json()
    console.log(`📅 Found ${calendars.length} active calendar(s) to refresh`)

    const results = {
      total: calendars.length,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[]
    }

    // Process each calendar
    for (const calendar of calendars) {
      const calendarId = calendar.calendar_metadata?.calendar_id
      const calendarName = calendar.name || calendarId

      console.log(`\n🔍 Processing calendar: ${calendarName}`)

      if (!calendar.calendar_metadata?.refresh_token) {
        console.log(`⏭️  Skipping ${calendarName}: No refresh token`)
        results.skipped++
        results.details.push({ calendar: calendarName, status: 'skipped', reason: 'no_refresh_token' })
        continue
      }

      // Check if token needs refresh (refresh if expiring within 10 minutes)
      const tokenExpiresAt = new Date(calendar.calendar_metadata.token_expires_at)
      const now = new Date()
      const minutesUntilExpiry = (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60)

      console.log(`⏰ Token expires at: ${tokenExpiresAt.toISOString()}`)
      console.log(`⏰ Minutes until expiry: ${minutesUntilExpiry.toFixed(1)}`)

      // Refresh if expiring within 10 minutes (or already expired)
      if (minutesUntilExpiry > 10) {
        console.log(`✅ Token still valid for ${calendarName} (${minutesUntilExpiry.toFixed(1)} minutes remaining)`)
        results.skipped++
        results.details.push({
          calendar: calendarName,
          status: 'skipped',
          reason: 'token_still_valid',
          minutes_remaining: minutesUntilExpiry.toFixed(1)
        })
        continue
      }

      // Refresh the token
      try {
        console.log(`🔄 Refreshing token for ${calendarName}...`)
        const tokens = await refreshMicrosoftToken(calendar.calendar_metadata.refresh_token)

        const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 60 minutes from now
        const newRefreshToken = tokens.refreshToken || calendar.calendar_metadata.refresh_token

        console.log(`💾 Saving refreshed tokens for ${calendarName}...`)

        // Update the database
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/media_assets?id=eq.${calendar.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            calendar_metadata: {
              ...calendar.calendar_metadata,
              access_token: tokens.accessToken,
              refresh_token: newRefreshToken,
              token_expires_at: newExpiresAt,
              last_token_refresh: new Date().toISOString()
            }
          })
        })

        if (updateResponse.ok) {
          console.log(`✅ Successfully refreshed tokens for ${calendarName}`)
          results.refreshed++
          results.details.push({
            calendar: calendarName,
            status: 'refreshed',
            new_expires_at: newExpiresAt
          })
        } else {
          const errorText = await updateResponse.text()
          console.error(`❌ Failed to save tokens for ${calendarName}:`, updateResponse.status, errorText)
          results.failed++
          results.details.push({
            calendar: calendarName,
            status: 'failed',
            reason: 'database_update_failed',
            error: errorText
          })
        }
      } catch (error) {
        console.error(`❌ Failed to refresh token for ${calendarName}:`, error)
        results.failed++
        results.details.push({
          calendar: calendarName,
          status: 'failed',
          reason: 'refresh_failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`\n✅ Token refresh complete: ${results.refreshed} refreshed, ${results.skipped} skipped, ${results.failed} failed`)

    return NextResponse.json({
      success: true,
      summary: results,
      message: `Refreshed ${results.refreshed} of ${results.total} calendars`
    })

  } catch (error) {
    console.error('💥 Token refresh job failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Token refresh job failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET handler - for manual triggering from browser/curl
 * POST is preferred for cron jobs
 */
export async function GET(request: NextRequest) {
  return POST(request)
}
