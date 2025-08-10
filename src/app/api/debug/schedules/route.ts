import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Get all active schedules
    const schedulesResponse = await fetch(`${url}/rest/v1/schedules?is_active=eq.true&select=*,playlists(*)`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!schedulesResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    const schedules = await schedulesResponse.json()
    
    return NextResponse.json({
      total_schedules: schedules.length,
      schedules: schedules.map(s => ({
        id: s.id,
        name: s.name,
        start_time: s.start_time,
        end_time: s.end_time,
        days_of_week: s.days_of_week,
        screen_ids: s.screen_ids,
        screen_types: s.screen_types,
        playlist_name: s.playlists?.name
      }))
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Internal server error',
      debug: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}