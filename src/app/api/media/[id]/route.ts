import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get user's organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Get media asset with folder info
    const { data: mediaAsset, error } = await supabase
      .from('media_assets')
      .select(`
        *,
        media_folders(name),
        user_profiles!created_by(full_name, email)
      `)
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .single()

    if (error) {
      console.error('Error fetching media asset:', error)
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
    }

    // Get usage information (playlists using this asset)
    const { data: usageData } = await supabase
      .from('playlist_items')
      .select(`
        playlists(id, name)
      `)
      .eq('media_asset_id', id)

    const usage = usageData?.map(item => item.playlists).filter(Boolean) || []

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
    const supabase = await createClient()
    const body = await request.json()

    // Get user's organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Update media asset
    const { data: mediaAsset, error } = await supabase
      .from('media_assets')
      .update(body)
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating media asset:', error)
      return NextResponse.json({ error: 'Failed to update media asset' }, { status: 500 })
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
    const supabase = await createClient()

    // Get user's organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if media is being used in playlists
    const { data: usageData } = await supabase
      .from('playlist_items')
      .select('id')
      .eq('media_asset_id', id)
      .limit(1)

    if (usageData && usageData.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete media asset that is being used in playlists' 
      }, { status: 400 })
    }

    // Get the media asset to get file path for storage deletion
    const { data: mediaAsset } = await supabase
      .from('media_assets')
      .select('file_path')
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .single()

    // Soft delete (mark as inactive) instead of hard delete
    const { error } = await supabase
      .from('media_assets')
      .update({ is_active: false })
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)

    if (error) {
      console.error('Error deleting media asset:', error)
      return NextResponse.json({ error: 'Failed to delete media asset' }, { status: 500 })
    }

    // TODO: Also delete from storage if needed
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