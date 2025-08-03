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
    const authHeader = request.headers.get('authorization')
    
    const user = await getAuthenticatedUser(authHeader)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization using REST API
    const userProfileResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=organization_id`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!userProfileResponse.ok) {
      return NextResponse.json({ error: 'Failed to get user profile' }, { status: 403 })
    }

    const userProfiles = await userProfileResponse.json()
    const userProfile = userProfiles[0]

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Get media asset with folder info using REST API
    const mediaResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${userProfile.organization_id}&select=*,media_folders!folder_id(name),user_profiles!created_by(full_name,email)`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!mediaResponse.ok) {
      console.error('Error fetching media asset:', await mediaResponse.text())
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    const mediaAssets = await mediaResponse.json()
    const mediaAsset = mediaAssets[0]
    
    if (!mediaAsset) {
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    // Get usage information (playlists using this asset) using REST API
    const usageResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/playlist_items?media_asset_id=eq.${id}&select=playlists(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    const authHeader = request.headers.get('authorization')
    const body = await request.json()

    const user = await getAuthenticatedUser(authHeader)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization using REST API
    const userProfileResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=organization_id`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!userProfileResponse.ok) {
      return NextResponse.json({ error: 'Failed to get user profile' }, { status: 403 })
    }

    const userProfiles = await userProfileResponse.json()
    const userProfile = userProfiles[0]

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Update media asset using REST API
    const updateResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${userProfile.organization_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      }
    )

    if (!updateResponse.ok) {
      console.error('Error updating media asset:', await updateResponse.text())
      return NextResponse.json({ error: 'Failed to update media asset' }, { status: 500 })
    }

    const updatedAssets = await updateResponse.json()
    const mediaAsset = updatedAssets[0]

    if (!mediaAsset) {
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

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
    const authHeader = request.headers.get('authorization')

    const user = await getAuthenticatedUser(authHeader)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization using REST API
    const userProfileResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=organization_id`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!userProfileResponse.ok) {
      return NextResponse.json({ error: 'Failed to get user profile' }, { status: 403 })
    }

    const userProfiles = await userProfileResponse.json()
    const userProfile = userProfiles[0]

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if media is being used in playlists using REST API
    const usageResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/playlist_items?media_asset_id=eq.${id}&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        }
      }
    )

    if (usageResponse.ok) {
      const usageData = await usageResponse.json()
      if (usageData && usageData.length > 0) {
        return NextResponse.json({ 
          error: 'Cannot delete media asset that is being used in playlists' 
        }, { status: 400 })
      }
    }

    // Soft delete (mark as inactive) instead of hard delete using REST API
    const deleteResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}&organization_id=eq.${userProfile.organization_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: false })
      }
    )

    if (!deleteResponse.ok) {
      console.error('Error deleting media asset:', await deleteResponse.text())
      return NextResponse.json({ error: 'Failed to delete media asset' }, { status: 500 })
    }

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