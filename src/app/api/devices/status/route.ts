import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface DeviceLogMetadata {
  system_info?: {
    cpu_percent?: number
    memory_percent?: number
    disk_usage?: number
    temperature?: number
    uptime?: number
  }
  cache_stats?: {
    total_files?: number
    total_size_mb?: number
    cache_dir?: string
  }
  playlist_info?: {
    current_index?: number
    playlist_size?: number
    current_state?: string
  }
  ip_address?: string
}

export async function GET(request: NextRequest) {
  try {
    // Use admin client for device status to bypass RLS
    const supabase = createAdminClient()
    if (!supabase) {
      console.error('Failed to create admin client for device status')
      return NextResponse.json({ 
        error: 'Service unavailable',
        devices: []
      }, { status: 503 })
    }

    // Get all screens with their device information and latest heartbeat data
    const { data: screens, error: screensError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        device_status,
        last_seen,
        location_id,
        locations!inner (
          id,
          name,
          districts (
            id,
            name
          )
        )
      `)
      .not('device_id', 'is', null)

    if (screensError) {
      console.error('Error fetching screens:', screensError)
      return NextResponse.json({ 
        error: 'Failed to fetch screens',
        devices: []
      }, { status: 500 })
    }

    // Get latest device logs for each device to extract system info
    const deviceIds = screens?.map(s => s.device_id).filter(Boolean) || []
    
    let latestLogs: any[] = []
    if (deviceIds.length > 0) {
      // Get the most recent heartbeat log for each device
      const { data: logs, error: logsError } = await supabase
        .from('device_logs')
        .select('screen_id, metadata, created_at')
        .in('screen_id', screens?.map(s => s.id) || [])
        .eq('log_level', 'debug')
        .like('message', 'Heartbeat:%')
        .order('created_at', { ascending: false })
        .limit(100) // Get recent logs, we'll filter to latest per device below

      if (!logsError && logs) {
        // Group by screen_id and take the most recent for each
        const logsByScreen = logs.reduce((acc, log) => {
          if (!acc[log.screen_id] || new Date(log.created_at) > new Date(acc[log.screen_id].created_at)) {
            acc[log.screen_id] = log
          }
          return acc
        }, {} as Record<string, any>)
        
        latestLogs = Object.values(logsByScreen)
      }
    }

    // Transform data for the frontend
    const devices = screens?.map(screen => {
      const latestLog = latestLogs.find(log => log.screen_id === screen.id)
      const metadata = latestLog?.metadata as DeviceLogMetadata | undefined

      return {
        id: screen.device_id,
        screen_id: screen.id,
        screen_name: screen.name,
        location_name: screen.locations?.name || 'Unknown',
        district_name: screen.locations?.districts?.name,
        status: screen.device_status || 'offline',
        last_seen: screen.last_seen,
        ip_address: metadata?.ip_address,
        system_info: metadata?.system_info,
        cache_stats: metadata?.cache_stats,
        playlist_info: metadata?.playlist_info
      }
    }) || []

    return NextResponse.json({
      success: true,
      devices,
      total: devices.length,
      online: devices.filter(d => d.status === 'online').length,
      offline: devices.filter(d => d.status === 'offline').length
    })

  } catch (error) {
    console.error('Device status error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      devices: []
    }, { status: 500 })
  }
}

// Allow OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}