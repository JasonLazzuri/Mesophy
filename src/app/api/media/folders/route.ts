import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/media/folders - Starting request')
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('GET /api/media/folders - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }
    
    const { searchParams } = new URL(request.url)
    const parentId = searchParams.get('parent_id') || null
    console.log('GET /api/media/folders - Parent ID:', parentId)

    // Get user's organization
    console.log('GET /api/media/folders - Getting user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('GET /api/media/folders - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log('GET /api/media/folders - User authenticated:', user.id)

    console.log('GET /api/media/folders - Getting user profile')
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('GET /api/media/folders - Profile error:', profileError)
      return NextResponse.json({ error: 'Failed to get user profile' }, { status: 500 })
    }

    if (!userProfile?.organization_id) {
      console.error('GET /api/media/folders - No organization found for user')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }
    console.log('GET /api/media/folders - Organization ID:', userProfile.organization_id)

    // Build query for folders
    let query = supabase
      .from('media_folders')
      .select(`
        *,
        user_profiles!created_by(full_name),
        media_assets(id)
      `)
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
      console.error('Error fetching folders:', error)
      return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
    }

    // Add item count to each folder
    const foldersWithCount = folders?.map(folder => ({
      ...folder,
      itemCount: folder.media_assets?.length || 0
    })) || []

    return NextResponse.json(foldersWithCount)

  } catch (error) {
    console.error('Error in folders API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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