import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    // Get query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const mediaType = searchParams.get('type') // 'image', 'video', or null for all
    const folderId = searchParams.get('folder_id') || null
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || []
    
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

    // Build query
    let query = supabase
      .from('media_assets')
      .select(`
        *,
        media_folders(name)
      `)
      .eq('organization_id', userProfile.organization_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    if (mediaType) {
      query = query.eq('media_type', mediaType)
    }

    if (folderId === 'null' || folderId === '') {
      query = query.is('folder_id', null)
    } else if (folderId) {
      query = query.eq('folder_id', folderId)
    }

    if (tags.length > 0) {
      query = query.contains('tags', tags)
    }

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: mediaAssets, error, count } = await query

    if (error) {
      console.error('Error fetching media assets:', error)
      return NextResponse.json({ error: 'Failed to fetch media assets' }, { status: 500 })
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('media_assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', userProfile.organization_id)
      .eq('is_active', true)

    return NextResponse.json({
      mediaAssets,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    })

  } catch (error) {
    console.error('Error in media API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
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

    // Create media asset record
    const mediaAssetData = {
      organization_id: userProfile.organization_id,
      created_by: user.id,
      ...body
    }

    const { data: mediaAsset, error } = await supabase
      .from('media_assets')
      .insert(mediaAssetData)
      .select()
      .single()

    if (error) {
      console.error('Error creating media asset:', error)
      return NextResponse.json({ error: 'Failed to create media asset' }, { status: 500 })
    }

    return NextResponse.json(mediaAsset, { status: 201 })

  } catch (error) {
    console.error('Error in media POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}