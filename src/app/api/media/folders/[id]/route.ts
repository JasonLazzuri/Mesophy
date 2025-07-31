import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const body = await request.json()
    const { name } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
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

    // Get the current folder to check parent
    const { data: currentFolder } = await supabase
      .from('media_folders')
      .select('parent_folder_id')
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .single()

    if (!currentFolder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check if folder name already exists in the same parent folder (excluding current folder)
    const { data: existingFolder } = await supabase
      .from('media_folders')
      .select('id')
      .eq('organization_id', userProfile.organization_id)
      .eq('name', name.trim())
      .eq('parent_folder_id', currentFolder.parent_folder_id)
      .neq('id', id)
      .limit(1)

    if (existingFolder && existingFolder.length > 0) {
      return NextResponse.json({ 
        error: 'A folder with this name already exists in this location' 
      }, { status: 400 })
    }

    // Update folder
    const { data: folder, error } = await supabase
      .from('media_folders')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating folder:', error)
      return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 })
    }

    return NextResponse.json(folder)

  } catch (error) {
    console.error('Error in folder PUT API:', error)
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

    // Check if folder has subfolders
    const { data: subfolders } = await supabase
      .from('media_folders')
      .select('id')
      .eq('parent_folder_id', id)
      .limit(1)

    if (subfolders && subfolders.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete folder that contains subfolders. Please move or delete subfolders first.' 
      }, { status: 400 })
    }

    // Check if folder has media assets
    const { data: mediaAssets } = await supabase
      .from('media_assets')
      .select('id')
      .eq('folder_id', id)
      .eq('is_active', true)
      .limit(1)

    if (mediaAssets && mediaAssets.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete folder that contains media files. Please move or delete files first.' 
      }, { status: 400 })
    }

    // Delete folder
    const { error } = await supabase
      .from('media_folders')
      .delete()
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)

    if (error) {
      console.error('Error deleting folder:', error)
      return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Folder deleted successfully' })

  } catch (error) {
    console.error('Error in folder DELETE API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}