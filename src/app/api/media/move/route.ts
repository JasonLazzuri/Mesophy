import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mediaIds, folderId } = body
    
    console.log('PUT /api/media/move - Moving media:', mediaIds, 'to folder:', folderId)

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: 'Media IDs are required' }, { status: 400 })
    }

    // Get environment variables (same pattern as working APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('PUT /api/media/move - Missing environment variables')
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
      console.error('PUT /api/media/move - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // If folderId is provided, verify the folder exists and belongs to user's organization
    if (folderId) {
      const folderResponse = await fetch(
        `${url}/rest/v1/media_folders?id=eq.${folderId}&organization_id=eq.${organizationId}&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!folderResponse.ok) {
        console.error('PUT /api/media/move - Error verifying folder:', folderResponse.status)
        return NextResponse.json({ error: 'Target folder not found' }, { status: 404 })
      }

      const folderData = await folderResponse.json()
      if (!folderData || folderData.length === 0) {
        console.error('PUT /api/media/move - Folder not found in organization')
        return NextResponse.json({ error: 'Target folder not found' }, { status: 404 })
      }
    }

    // Verify all media assets belong to user's organization
    const mediaIds_filter = mediaIds.map(id => `"${id}"`).join(',')
    const mediaResponse = await fetch(
      `${url}/rest/v1/media_assets?id=in.(${mediaIds_filter})&select=id,organization_id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!mediaResponse.ok) {
      console.error('PUT /api/media/move - Error verifying media assets:', mediaResponse.status)
      return NextResponse.json({ error: 'Some media assets not found' }, { status: 404 })
    }

    const mediaAssets = await mediaResponse.json()
    console.log('PUT /api/media/move - Found media assets:', mediaAssets.length, 'of', mediaIds.length)
    
    if (!mediaAssets || mediaAssets.length !== mediaIds.length) {
      console.error('PUT /api/media/move - Media count mismatch')
      return NextResponse.json({ error: 'Some media assets not found' }, { status: 404 })
    }

    const invalidAssets = mediaAssets.filter(asset => asset.organization_id !== organizationId)
    if (invalidAssets.length > 0) {
      console.error('PUT /api/media/move - Invalid assets found:', invalidAssets.length)
      return NextResponse.json({ error: 'Unauthorized access to some media assets' }, { status: 403 })
    }

    // Update media assets to move them to the folder (or remove from folder if folderId is null)
    const updateData = {
      folder_id: folderId || null,
      updated_at: new Date().toISOString()
    }
    
    console.log('PUT /api/media/move - Updating media assets with:', updateData)
    
    const updateResponse = await fetch(
      `${url}/rest/v1/media_assets?id=in.(${mediaIds_filter})&organization_id=eq.${organizationId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('PUT /api/media/move - Error updating media assets:', updateResponse.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to move media assets',
        details: errorText
      }, { status: 500 })
    }

    const updatedAssets = await updateResponse.json()
    console.log('PUT /api/media/move - Successfully moved:', updatedAssets.length, 'assets')

    return NextResponse.json({ 
      success: true, 
      movedCount: updatedAssets?.length || 0,
      folderId: folderId || null
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    }, { status: 500 })
  }
}