import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parentId = searchParams.get('parent_id') || null
    
    console.log('GET /api/media/folders - Starting request with parent_id:', parentId)

    // Get environment variables (same pattern as working APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('GET /api/media/folders - Missing environment variables')
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
      console.error('GET /api/media/folders - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Build query for folders using REST API
    let folderQuery = `${url}/rest/v1/media_folders?organization_id=eq.${organizationId}&select=*&order=name`
    
    // Filter by parent folder
    if (parentId === 'null' || parentId === '') {
      folderQuery += '&parent_folder_id=is.null'
    } else if (parentId) {
      folderQuery += `&parent_folder_id=eq.${parentId}`
    }
    
    console.log('GET /api/media/folders - Fetching folders with query:', folderQuery)

    const foldersResponse = await fetch(folderQuery, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json'
      }
    })

    if (!foldersResponse.ok) {
      const errorText = await foldersResponse.text()
      console.error('GET /api/media/folders - Error fetching folders:', foldersResponse.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to fetch folders',
        details: errorText
      }, { status: 500 })
    }

    const folders = await foldersResponse.json()
    console.log('GET /api/media/folders - Found folders:', folders.length)

    // Add item count to each folder by querying media_assets separately
    const foldersWithCount = []
    for (const folder of folders || []) {
      // Count ACTIVE media assets in this folder using REST API (exclude soft-deleted)
      const countResponse = await fetch(
        `${url}/rest/v1/media_assets?organization_id=eq.${organizationId}&folder_id=eq.${folder.id}&is_active=eq.true&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          }
        }
      )
      
      let count = 0
      if (countResponse.ok) {
        const countHeader = countResponse.headers.get('content-range')
        console.log(`GET /api/media/folders - Folder ${folder.id} (${folder.name}) count header:`, countHeader)
        if (countHeader) {
          // Parse count from content-range header like "0-9/10"
          const match = countHeader.match(/\/(\d+)$/)
          if (match) {
            count = parseInt(match[1], 10)
            console.log(`GET /api/media/folders - Folder ${folder.id} (${folder.name}) parsed count:`, count)
          }
        }
        // Also debug by getting the actual media items to see what's in there
        const debugResponse = await fetch(
          `${url}/rest/v1/media_assets?organization_id=eq.${organizationId}&folder_id=eq.${folder.id}&is_active=eq.true&select=id,name,is_active`,
          {
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey,
              'Content-Type': 'application/json'
            }
          }
        )
        if (debugResponse.ok) {
          const debugMedia = await debugResponse.json()
          console.log(`GET /api/media/folders - Folder ${folder.id} (${folder.name}) actual active media:`, debugMedia.length, debugMedia.map(m => `${m.name}(${m.id})`))
        }
      } else {
        console.error(`GET /api/media/folders - Error getting count for folder ${folder.id}:`, countResponse.status)
      }
      
      foldersWithCount.push({
        ...folder,
        itemCount: count
      })
    }

    console.log('GET /api/media/folders - Returning folders with counts:', foldersWithCount.length)
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
    const body = await request.json()
    const { id, name, parent_folder_id } = body
    
    console.log('PUT /api/media/folders - Starting request for id:', id)

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: 'Folder ID and name are required' }, { status: 400 })
    }

    // Get environment variables (same pattern as working APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('PUT /api/media/folders - Missing environment variables')
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
      console.error('PUT /api/media/folders - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if folder exists and belongs to organization
    const existingResponse = await fetch(
      `${url}/rest/v1/media_folders?id=eq.${id}&organization_id=eq.${organizationId}&select=id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!existingResponse.ok) {
      console.error('PUT /api/media/folders - Error checking existing folder:', existingResponse.status)
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const existingData = await existingResponse.json()
    if (!existingData || existingData.length === 0) {
      console.error('PUT /api/media/folders - Folder not found in organization')
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check if folder name already exists in the same parent folder (excluding current folder)
    let duplicateQuery = `${url}/rest/v1/media_folders?organization_id=eq.${organizationId}&name=eq.${encodeURIComponent(name.trim())}&id=neq.${id}&select=id&limit=1`
    
    if (parent_folder_id) {
      duplicateQuery += `&parent_folder_id=eq.${parent_folder_id}`
    } else {
      duplicateQuery += '&parent_folder_id=is.null'
    }
    
    const duplicateResponse = await fetch(duplicateQuery, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json'
      }
    })

    if (duplicateResponse.ok) {
      const duplicateData = await duplicateResponse.json()
      if (duplicateData && duplicateData.length > 0) {
        console.error('PUT /api/media/folders - Duplicate folder name found')
        return NextResponse.json({ 
          error: 'A folder with this name already exists in this location' 
        }, { status: 400 })
      }
    }

    // Update folder using REST API
    const updateData = {
      name: name.trim(),
      parent_folder_id: parent_folder_id || null,
      updated_at: new Date().toISOString()
    }
    
    const updateResponse = await fetch(
      `${url}/rest/v1/media_folders?id=eq.${id}&organization_id=eq.${organizationId}`,
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
      console.error('PUT /api/media/folders - Error updating folder:', updateResponse.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to update folder',
        details: errorText
      }, { status: 500 })
    }

    const updatedFolders = await updateResponse.json()
    const folder = updatedFolders[0]

    if (!folder) {
      console.error('PUT /api/media/folders - No folder returned after update')
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    console.log('PUT /api/media/folders - Folder updated successfully:', folder.name)
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
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('id')
    
    console.log('DELETE /api/media/folders - Starting request for id:', folderId)

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 })
    }

    // Get environment variables (same pattern as working APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('DELETE /api/media/folders - Missing environment variables')
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
      console.error('DELETE /api/media/folders - No organization found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if folder exists and belongs to organization
    const existingResponse = await fetch(
      `${url}/rest/v1/media_folders?id=eq.${folderId}&organization_id=eq.${organizationId}&select=id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!existingResponse.ok) {
      console.error('DELETE /api/media/folders - Error checking existing folder:', existingResponse.status)
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const existingData = await existingResponse.json()
    if (!existingData || existingData.length === 0) {
      console.error('DELETE /api/media/folders - Folder not found in organization')
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check if folder has subfolders
    const subfoldersResponse = await fetch(
      `${url}/rest/v1/media_folders?parent_folder_id=eq.${folderId}&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (subfoldersResponse.ok) {
      const subfolders = await subfoldersResponse.json()
      if (subfolders && subfolders.length > 0) {
        console.error('DELETE /api/media/folders - Folder has subfolders')
        return NextResponse.json({ 
          error: 'Cannot delete folder that contains subfolders. Please delete or move subfolders first.' 
        }, { status: 400 })
      }
    }

    // Check if folder contains ACTIVE media assets (exclude soft-deleted)
    const mediaResponse = await fetch(
      `${url}/rest/v1/media_assets?folder_id=eq.${folderId}&is_active=eq.true&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (mediaResponse.ok) {
      const mediaAssets = await mediaResponse.json()
      console.log('DELETE /api/media/folders - Found ACTIVE media assets in folder:', mediaAssets.length)
      if (mediaAssets && mediaAssets.length > 0) {
        console.error('DELETE /api/media/folders - Folder contains active media assets')
        return NextResponse.json({ 
          error: 'Cannot delete folder that contains media files. Please move or delete media files first.' 
        }, { status: 400 })
      }
    }

    // Delete folder using REST API
    const deleteResponse = await fetch(
      `${url}/rest/v1/media_folders?id=eq.${folderId}&organization_id=eq.${organizationId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      console.error('DELETE /api/media/folders - Error deleting folder:', deleteResponse.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to delete folder',
        details: errorText
      }, { status: 500 })
    }

    console.log('DELETE /api/media/folders - Folder deleted successfully:', folderId)
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
    const body = await request.json()
    const { name, parent_folder_id } = body
    
    console.log('POST /api/media/folders - Starting request for name:', name)

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
    }

    // Get environment variables (same pattern as working APIs)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_SERVICE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('POST /api/media/folders - Missing environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Get first organization and a user ID for created_by
    const orgResponse = await fetch(`${url}/rest/v1/user_profiles?select=organization_id,id&limit=1`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      }
    })
    
    let organizationId = null
    let userId = null
    if (orgResponse.ok) {
      const orgData = await orgResponse.json()
      organizationId = orgData[0]?.organization_id
      userId = orgData[0]?.id
    }

    if (!organizationId || !userId) {
      console.error('POST /api/media/folders - No organization or user found')
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    // Check if folder name already exists in the same parent folder
    let duplicateQuery = `${url}/rest/v1/media_folders?organization_id=eq.${organizationId}&name=eq.${encodeURIComponent(name.trim())}&select=id&limit=1`
    
    if (parent_folder_id) {
      duplicateQuery += `&parent_folder_id=eq.${parent_folder_id}`
    } else {
      duplicateQuery += '&parent_folder_id=is.null'
    }
    
    const duplicateResponse = await fetch(duplicateQuery, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json'
      }
    })

    if (duplicateResponse.ok) {
      const duplicateData = await duplicateResponse.json()
      if (duplicateData && duplicateData.length > 0) {
        console.error('POST /api/media/folders - Duplicate folder name found')
        return NextResponse.json({ 
          error: 'A folder with this name already exists in this location' 
        }, { status: 400 })
      }
    }

    // Create folder using REST API
    const folderData = {
      organization_id: organizationId,
      name: name.trim(),
      parent_folder_id: parent_folder_id || null,
      created_by: userId
    }
    
    console.log('POST /api/media/folders - Creating folder with data:', folderData)
    
    const createResponse = await fetch(
      `${url}/rest/v1/media_folders`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(folderData)
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('POST /api/media/folders - Error creating folder:', createResponse.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to create folder',
        details: errorText
      }, { status: 500 })
    }

    const createdFolders = await createResponse.json()
    const folder = createdFolders[0]

    if (!folder) {
      console.error('POST /api/media/folders - No folder returned after creation')
      return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
    }

    console.log('POST /api/media/folders - Folder created successfully:', folder.name)
    return NextResponse.json(folder, { status: 201 })

  } catch (error) {
    console.error('Error in folders POST API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}