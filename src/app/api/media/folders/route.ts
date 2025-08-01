import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database unavailable',
        details: 'Supabase client initialization failed'
      }, { status: 503 })
    }
    
    const { searchParams } = new URL(request.url)
    const parentId = searchParams.get('parent_id') || null

    // Get user's organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: authError?.message || 'No user found'
      }, { status: 401 })
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ 
        error: 'Failed to get user profile',
        details: profileError.message,
        code: profileError.code
      }, { status: 500 })
    }

    if (!userProfile?.organization_id) {
      return NextResponse.json({ 
        error: 'No organization found',
        details: 'User profile exists but has no organization_id'
      }, { status: 403 })
    }

    // Test if media_folders table exists by checking if we can query it
    const { data: testQuery, error: tableError } = await supabase
      .from('media_folders')
      .select('id')
      .limit(1)

    if (tableError) {
      return NextResponse.json({ 
        error: 'Database table error',
        details: tableError.message,
        code: tableError.code,
        hint: tableError.hint
      }, { status: 500 })
    }

    // Build query for folders (simplified to avoid relationship issues)
    let query = supabase
      .from('media_folders')
      .select('*')
      .eq('organization_id', userProfile.organization_id)
      .order('name')

    // Filter by parent folder
    if (parentId === 'null' || parentId === '') {
      query = query.is('parent_folder_id', null)
    } else if (parentId) {
      query = query.eq('parent_folder_id', parentId)
    }

    const { data: folders, error } = await query

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to fetch folders',
        details: error.message,
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }

    // Add item count to each folder (simplified without media_assets join)
    const foldersWithCount = folders?.map(folder => ({
      ...folder,
      itemCount: 0 // TODO: Get actual count with separate query if needed
    })) || []

    return NextResponse.json(foldersWithCount)

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error',
      stack: error.stack
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, name, parent_folder_id } = body

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: 'Folder ID and name are required' }, { status: 400 })
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

    // Check if folder exists and belongs to user's organization
    const { data: existingFolder } = await supabase
      .from('media_folders')
      .select('id')
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .single()

    if (!existingFolder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check if folder name already exists in the same parent folder (excluding current folder)
    const { data: duplicateFolder } = await supabase
      .from('media_folders')
      .select('id')
      .eq('organization_id', userProfile.organization_id)
      .eq('name', name.trim())
      .eq('parent_folder_id', parent_folder_id || null)
      .neq('id', id)
      .limit(1)

    if (duplicateFolder && duplicateFolder.length > 0) {
      return NextResponse.json({ 
        error: 'A folder with this name already exists in this location' 
      }, { status: 400 })
    }

    // Update folder
    const { data: folder, error } = await supabase
      .from('media_folders')
      .update({
        name: name.trim(),
        parent_folder_id: parent_folder_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', userProfile.organization_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to update folder',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json(folder)

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('id')

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 })
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

    // Check if folder exists and belongs to user's organization
    const { data: existingFolder } = await supabase
      .from('media_folders')
      .select('id')
      .eq('id', folderId)
      .eq('organization_id', userProfile.organization_id)
      .single()

    if (!existingFolder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check if folder has subfolders
    const { data: subfolders } = await supabase
      .from('media_folders')
      .select('id')
      .eq('parent_folder_id', folderId)
      .limit(1)

    if (subfolders && subfolders.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete folder that contains subfolders. Please delete or move subfolders first.' 
      }, { status: 400 })
    }

    // Check if folder contains media assets
    const { data: mediaAssets } = await supabase
      .from('media_assets')
      .select('id')
      .eq('folder_id', folderId)
      .limit(1)

    if (mediaAssets && mediaAssets.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete folder that contains media files. Please move or delete media files first.' 
      }, { status: 400 })
    }

    // Delete folder
    const { error } = await supabase
      .from('media_folders')
      .delete()
      .eq('id', folderId)
      .eq('organization_id', userProfile.organization_id)

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to delete folder',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { name, parent_folder_id } = body

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

    // Check if folder name already exists in the same parent folder
    const { data: existingFolder } = await supabase
      .from('media_folders')
      .select('id')
      .eq('organization_id', userProfile.organization_id)
      .eq('name', name.trim())
      .eq('parent_folder_id', parent_folder_id || null)
      .limit(1)

    if (existingFolder && existingFolder.length > 0) {
      return NextResponse.json({ 
        error: 'A folder with this name already exists in this location' 
      }, { status: 400 })
    }

    // Create folder
    const folderData = {
      organization_id: userProfile.organization_id,
      name: name.trim(),
      parent_folder_id: parent_folder_id || null,
      created_by: user.id
    }

    const { data: folder, error } = await supabase
      .from('media_folders')
      .insert(folderData)
      .select()
      .single()

    if (error) {
      console.error('Error creating folder:', error)
      return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
    }

    return NextResponse.json(folder, { status: 201 })

  } catch (error) {
    console.error('Error in folders POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}