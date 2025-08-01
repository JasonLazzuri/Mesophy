import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { mediaIds, folderId } = body

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: 'Media IDs are required' }, { status: 400 })
    }

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

    // If folderId is provided, verify the folder exists and belongs to user's organization
    if (folderId) {
      const { data: folder } = await supabase
        .from('media_folders')
        .select('id')
        .eq('id', folderId)
        .eq('organization_id', userProfile.organization_id)
        .single()

      if (!folder) {
        return NextResponse.json({ error: 'Target folder not found' }, { status: 404 })
      }
    }

    // Verify all media assets belong to user's organization
    const { data: mediaAssets } = await supabase
      .from('media_assets')
      .select('id, organization_id')
      .in('id', mediaIds)

    if (!mediaAssets || mediaAssets.length !== mediaIds.length) {
      return NextResponse.json({ error: 'Some media assets not found' }, { status: 404 })
    }

    const invalidAssets = mediaAssets.filter(asset => asset.organization_id !== userProfile.organization_id)
    if (invalidAssets.length > 0) {
      return NextResponse.json({ error: 'Unauthorized access to some media assets' }, { status: 403 })
    }

    // Update media assets to move them to the folder (or remove from folder if folderId is null)
    const { data: updatedAssets, error } = await supabase
      .from('media_assets')
      .update({ 
        folder_id: folderId || null,
        updated_at: new Date().toISOString()
      })
      .in('id', mediaIds)
      .eq('organization_id', userProfile.organization_id)
      .select()

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to move media assets',
        details: error.message
      }, { status: 500 })
    }

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