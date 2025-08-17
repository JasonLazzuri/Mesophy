import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const device_id = searchParams.get('device_id')
  const search = searchParams.get('search')

  try {
    // Use admin client for device operations to bypass RLS
    const supabase = createAdminClient()
    if (!supabase) {
      console.error('Failed to create admin client for screen lookup')
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    let query = supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        device_status,
        last_seen,
        locations!inner (
          name,
          districts (name)
        )
      `)

    if (device_id) {
      query = query.eq('device_id', device_id)
    } else if (search) {
      query = query.or(`device_id.ilike.%${search}%,name.ilike.%${search}%`)
    } else {
      // Show all screens
      query = query.limit(20)
    }

    const { data: screens, error } = await query

    if (error) {
      console.error('Error finding screens:', error)
      return NextResponse.json({ 
        error: 'Failed to find screens' 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      screens: screens || [],
      query: { device_id, search }
    })

  } catch (error) {
    console.error('Find screen error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}