import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mediaIds } = body
    console.log('PUT /api/media/remove-from-folder - Starting request for mediaIds:', mediaIds)

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: 'mediaIds array is required' }, { status: 400 })
    }

    // Get environment variables (same pattern as other APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('PUT /api/media/remove-from-folder - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Get first organization
    const orgResponse = await fetch(`${url}/rest/v1/user_profiles?select=organization_id&limit=1`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      }
    })
    
    let organizationId = null
    if (orgResponse.ok) {
      const orgData = await orgResponse.json()
      organizationId = orgData[0]?.organization_id
    }

    if (!organizationId) {
      console.error('PUT /api/media/remove-from-folder - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Remove media from folders (set folder_id to null) but keep media active
    const removeResponse = await fetch(
      `${url}/rest/v1/media_assets?id=in.(${mediaIds.join(',')})&organization_id=eq.${organizationId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ 
          folder_id: null // Remove from folder but keep media active
        })
      }
    )

    if (!removeResponse.ok) {
      const errorText = await removeResponse.text()
      console.error('Error removing media from folder:', removeResponse.status, errorText)
      return NextResponse.json({ error: 'Failed to remove media from folder' }, { status: 500 })
    }

    const updatedAssets = await removeResponse.json()
    console.log(`Successfully removed ${updatedAssets.length} media assets from folder`)

    return NextResponse.json({ 
      message: 'Media removed from folder successfully',
      count: updatedAssets.length,
      mediaAssets: updatedAssets
    })

  } catch (error) {
    console.error('Error in media remove-from-folder API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}