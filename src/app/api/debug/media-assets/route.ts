import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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

    // Get playlist ID from query params
    const { searchParams } = new URL(request.url)
    const playlistId = searchParams.get('playlist_id') || 'be229aa6-c0d0-432a-b8bf-648070bb2160'

    // Get media assets for the playlist
    const mediaResponse = await fetch(`${url}/rest/v1/media_assets?playlist_id=eq.${playlistId}&select=*&order=order_index`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!mediaResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch media assets',
        status: mediaResponse.status,
        statusText: mediaResponse.statusText
      }, { status: 500 })
    }

    const mediaAssets = await mediaResponse.json()
    
    return NextResponse.json({
      playlist_id: playlistId,
      total_media_assets: mediaAssets.length,
      media_assets: mediaAssets
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Internal server error',
      debug: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}