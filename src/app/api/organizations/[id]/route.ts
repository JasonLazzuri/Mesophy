import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('GET /api/organizations/[id] - Starting request for ID:', params.id)
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('GET /api/organizations/[id] - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user and check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('GET /api/organizations/[id] - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('GET /api/organizations/[id] - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Verify user can access this organization (only their own)
    if (profile.organization_id !== params.id) {
      return NextResponse.json({ error: 'Access denied to this organization' }, { status: 403 })
    }

    // Fetch organization with related data
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select(`
        *,
        districts:districts(
          id, name, is_active, created_at,
          locations:locations(count)
        ),
        user_profiles:user_profiles(
          id, email, full_name, role, is_active
        )
      `)
      .eq('id', params.id)
      .single()

    if (orgError) {
      console.error('GET /api/organizations/[id] - Failed to fetch organization:', orgError)
      if (orgError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    console.log('GET /api/organizations/[id] - Organization fetched successfully')
    return NextResponse.json({ organization })

  } catch (error) {
    console.error('GET /api/organizations/[id] - Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('PUT /api/organizations/[id] - Starting update request for ID:', params.id)
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('PUT /api/organizations/[id] - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user and check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('PUT /api/organizations/[id] - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('PUT /api/organizations/[id] - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Only super admins can update organizations
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ 
        error: 'Insufficient permissions to update organization' 
      }, { status: 403 })
    }

    // Verify user can access this organization (only their own)
    if (profile.organization_id !== params.id) {
      return NextResponse.json({ error: 'Access denied to this organization' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { name, description, settings, is_active } = body

    // Build update object with only provided fields
    const updates: any = { updated_at: new Date().toISOString() }

    if (name !== undefined) {
      if (!name || name.trim().length < 2 || name.trim().length > 100) {
        return NextResponse.json({ 
          error: 'Organization name must be between 2 and 100 characters' 
        }, { status: 400 })
      }

      // Check if name is being changed and if new name already exists
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', params.id)
        .single()

      if (existingOrg && existingOrg.name !== name.trim()) {
        const { data: duplicateOrg } = await supabase
          .from('organizations')
          .select('id')
          .ilike('name', name.trim())
          .neq('id', params.id)
          .limit(1)

        if (duplicateOrg && duplicateOrg.length > 0) {
          return NextResponse.json({ 
            error: 'Organization with this name already exists' 
          }, { status: 409 })
        }
      }

      updates.name = name.trim()
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null
    }

    if (settings !== undefined) {
      updates.settings = settings || {}
    }

    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active)
    }

    // Update organization
    console.log('PUT /api/organizations/[id] - Updating organization')
    const { data: organization, error: updateError } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('PUT /api/organizations/[id] - Error updating organization:', updateError)
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      return NextResponse.json({ 
        error: 'Failed to update organization',
        details: updateError.message
      }, { status: 500 })
    }

    console.log('PUT /api/organizations/[id] - Organization updated successfully')
    return NextResponse.json({ 
      message: 'Organization updated successfully',
      organization
    })

  } catch (error) {
    console.error('PUT /api/organizations/[id] - Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('DELETE /api/organizations/[id] - Starting delete request for ID:', params.id)
    
    const supabase = await createClient()
    
    if (!supabase) {
      console.error('DELETE /api/organizations/[id] - Supabase client not available')
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    // Get current user and check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('DELETE /api/organizations/[id] - Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('DELETE /api/organizations/[id] - Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Only super admins can delete organizations
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ 
        error: 'Insufficient permissions to delete organization' 
      }, { status: 403 })
    }

    // Note: Deleting the user's own organization would be problematic
    // In a real system, this would require special handling
    if (profile.organization_id === params.id) {
      return NextResponse.json({ 
        error: 'Cannot delete your own organization. Contact system administrator.' 
      }, { status: 400 })
    }

    // Check if organization exists and get related data counts
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select(`
        id, name,
        districts:districts(count),
        user_profiles:user_profiles(count)
      `)
      .eq('id', params.id)
      .single()

    if (orgError) {
      if (orgError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    // Check if organization has dependent data
    const districtCount = organization.districts?.[0]?.count || 0
    const userCount = organization.user_profiles?.[0]?.count || 0

    if (districtCount > 0 || userCount > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete organization with existing districts or users',
        details: `Organization has ${districtCount} districts and ${userCount} users`
      }, { status: 409 })
    }

    // Delete organization
    console.log('DELETE /api/organizations/[id] - Deleting organization')
    const { error: deleteError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('DELETE /api/organizations/[id] - Error deleting organization:', deleteError)
      return NextResponse.json({ 
        error: 'Failed to delete organization',
        details: deleteError.message
      }, { status: 500 })
    }

    console.log('DELETE /api/organizations/[id] - Organization deleted successfully')
    return NextResponse.json({ 
      message: 'Organization deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/organizations/[id] - Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}