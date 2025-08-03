import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, role, district_id, location_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Use the database function to get accessible locations
    const { data: locations, error: locationsError } = await supabase
      .rpc('get_user_accessible_locations', {
        user_id: user.id
      })

    if (locationsError) {
      console.error('Error fetching accessible locations:', locationsError)
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
    }

    // Group locations by district for easier UI handling
    const locationsByDistrict: Record<string, {
      district: { id: string; name: string },
      locations: Array<{ id: string; name: string }>
    }> = {}

    locations?.forEach((location) => {
      const districtKey = location.district_id
      if (!locationsByDistrict[districtKey]) {
        locationsByDistrict[districtKey] = {
          district: {
            id: location.district_id,
            name: location.district_name
          },
          locations: []
        }
      }
      locationsByDistrict[districtKey].locations.push({
        id: location.location_id,
        name: location.location_name
      })
    })

    return NextResponse.json({ 
      locations: locations || [],
      locationsByDistrict 
    })
  } catch (error) {
    console.error('Error in accessible locations GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}