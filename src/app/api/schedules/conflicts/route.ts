import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      schedule_id = null,
      screen_id,
      screen_ids = [],
      target_screen_types = null,
      target_locations = null,
      start_date,
      end_date,
      start_time,
      end_time,
      days_of_week,
      priority
    } = body

    // Validate required fields
    if (!start_date || !start_time || !end_time || !days_of_week) {
      return NextResponse.json({ 
        error: 'start_date, start_time, end_time, and days_of_week are required' 
      }, { status: 400 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Build list of screens to check
    const screensToCheck = []
    if (screen_id) screensToCheck.push(screen_id)
    if (screen_ids.length > 0) screensToCheck.push(...screen_ids)

    const conflicts = []

    // Check for conflicts on each screen
    for (const targetScreenId of screensToCheck) {
      // Use the database function to check conflicts
      const { data: conflictData, error: conflictError } = await supabase
        .rpc('check_schedule_conflicts', {
          schedule_uuid: schedule_id,
          p_screen_id: targetScreenId,
          p_start_date: start_date,
          p_end_date: end_date,
          p_start_time: start_time,
          p_end_time: end_time,
          p_days_of_week: days_of_week,
          p_priority: priority || 1,
          p_target_screen_types: target_screen_types,
          p_target_locations: target_locations
        })

      if (conflictError) {
        console.error('Error checking conflicts:', conflictError)
        continue
      }

      if (conflictData && conflictData.length > 0) {
        // Get screen info for conflicts
        const { data: screenInfo } = await supabase
          .from('screens')
          .select(`
            id,
            name,
            location_id,
            locations (
              id,
              name,
              district_id,
              districts (
                id,
                name
              )
            )
          `)
          .eq('id', targetScreenId)
          .single()

        conflicts.push({
          screen_id: targetScreenId,
          screen: screenInfo,
          conflicting_schedules: conflictData
        })
      }
    }

    // Check for screen-type and location-based conflicts if target_screen_types are specified
    if (target_screen_types && target_screen_types.length > 0 && !screen_id && screen_ids.length === 0) {
      const { data: screenTypeConflicts, error: screenTypeError } = await supabase
        .rpc('check_schedule_conflicts', {
          schedule_uuid: schedule_id,
          p_screen_id: null,
          p_start_date: start_date,
          p_end_date: end_date,
          p_start_time: start_time,
          p_end_time: end_time,
          p_days_of_week: days_of_week,
          p_priority: priority || 1,
          p_target_screen_types: target_screen_types,
          p_target_locations: target_locations
        })

      if (!screenTypeError && screenTypeConflicts && screenTypeConflicts.length > 0) {
        // Build descriptive name for the conflict
        let conflictName = target_screen_types.join(', ') + ' screens'
        if (target_locations && target_locations.length > 0) {
          // Get location names for better display
          const { data: locations } = await supabase
            .from('locations')
            .select('name')
            .in('id', target_locations)
          
          if (locations && locations.length > 0) {
            const locationNames = locations.map(l => l.name).join(', ')
            conflictName += ` at ${locationNames}`
          }
        }
        
        conflicts.push({
          screen_id: null,
          screen: { name: conflictName },
          conflicting_schedules: screenTypeConflicts
        })
      }
    }

    return NextResponse.json({ 
      has_conflicts: conflicts.length > 0,
      conflicts 
    })
  } catch (error) {
    console.error('Error in schedule conflicts POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}