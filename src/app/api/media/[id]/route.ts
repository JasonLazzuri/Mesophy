import { NextRequest, NextResponse } from 'next/server'

async function getAuthenticatedUser(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      }
    })

    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Auth error:', error)
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('GET /api/media/[id] - Starting request for id:', id)

    // Get environment variables (same pattern as users API)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('GET /api/media/[id] - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // For now, let's get the first organization (same pattern as users API)
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
      console.error('GET /api/media/[id] - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Get media asset with folder info using REST API
    const mediaResponse = await fetch(
      `${url}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${organizationId}&select=*,media_folders!folder_id(name),user_profiles!created_by(full_name,email)`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text()
      console.error('Error fetching media asset:', mediaResponse.status, errorText)
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    const mediaAssets = await mediaResponse.json()
    const mediaAsset = mediaAssets[0]
    
    if (!mediaAsset) {
      console.error('No media asset found with id:', id)
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    console.log('Found media asset:', mediaAsset.name)

    // Get usage information (playlists using this asset) using REST API
    const usageResponse = await fetch(
      `${url}/rest/v1/playlist_items?media_asset_id=eq.${id}&select=playlists(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    let usage = []
    if (usageResponse.ok) {
      const usageData = await usageResponse.json()
      usage = usageData?.map((item: any) => item.playlists).filter(Boolean) || []
    }

    return NextResponse.json({
      ...mediaAsset,
      usage
    })

  } catch (error) {
    console.error('Error in media GET API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    console.log('PUT /api/media/[id] - Starting request for id:', id)

    // Get environment variables (same pattern as users API)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('PUT /api/media/[id] - Missing environment variables')
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
      console.error('PUT /api/media/[id] - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Update media asset using REST API
    const updateResponse = await fetch(
      `${url}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${organizationId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Error updating media asset:', updateResponse.status, errorText)
      return NextResponse.json({ error: 'Failed to update media asset' }, { status: 500 })
    }

    const updatedAssets = await updateResponse.json()
    const mediaAsset = updatedAssets[0]

    if (!mediaAsset) {
      console.error('No media asset returned after update for id:', id)
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    console.log('Media asset updated successfully:', mediaAsset.name)
    return NextResponse.json(mediaAsset)

  } catch (error) {
    console.error('Error in media PUT API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('DELETE /api/media/[id] - Starting request for id:', id)

    // Get environment variables (same pattern as users API)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('DELETE /api/media/[id] - Missing environment variables')
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
      console.error('DELETE /api/media/[id] - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if media is being used in playlists using REST API
    const usageResponse = await fetch(
      `${url}/rest/v1/playlist_items?media_asset_id=eq.${id}&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (usageResponse.ok) {
      const usageData = await usageResponse.json()
      if (usageData && usageData.length > 0) {
        console.log('Media asset is used in playlists, cannot delete')
        return NextResponse.json({ 
          error: 'Cannot delete media asset that is being used in playlists' 
        }, { status: 400 })
      }
    }

    // Soft delete (mark as inactive) instead of hard delete using REST API
    const deleteResponse = await fetch(
      `${url}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${organizationId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: false })
      }
    )

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      console.error('Error deleting media asset:', deleteResponse.status, errorText)
      return NextResponse.json({ error: 'Failed to delete media asset' }, { status: 500 })
    }

    console.log('Media asset marked as inactive:', id)

    // TODO: Also delete from storage if needed
    // Get the media asset to get file path for storage deletion
    // const mediaAsset = await fetch(...) 
    // if (mediaAsset?.file_path) {
    //   await supabase.storage
    //     .from('media-assets')
    //     .remove([mediaAsset.file_path])
    // }

    return NextResponse.json({ message: 'Media asset deleted successfully' })

  } catch (error) {
    console.error('Error in media DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}