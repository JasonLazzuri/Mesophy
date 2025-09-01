import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface DeviceStatus {
  device_id: string
  screen_id: string
  screen_name: string
  location_name: string
  last_seen: string | null
  minutes_offline: number
  status: 'online' | 'offline'
}

interface PerformanceMetric {
  device_id: string
  screen_id: string
  screen_name: string
  location_name: string
  memory_usage: number
  storage_usage: number
  cpu_usage: number
  last_reported: string
}

// GET: Check device health and trigger alerts for offline devices and performance issues
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const triggerAlerts = searchParams.get('trigger_alerts') === 'true'
    const offlineThresholdMinutes = parseInt(searchParams.get('offline_threshold') || '30')

    // Get all active devices with their last heartbeat
    const { data: devices, error: devicesError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        last_seen,
        status,
        locations!inner (
          name,
          district_id,
          districts!inner (
            name,
            organization_id
          )
        )
      `)
      .not('device_id', 'is', null)
      .eq('is_active', true)

    if (devicesError) {
      console.error('Error fetching devices:', devicesError)
      return NextResponse.json({ 
        error: 'Failed to fetch devices' 
      }, { status: 500 })
    }

    const currentTime = new Date()
    const deviceStatuses: DeviceStatus[] = []
    const offlineDevices: DeviceStatus[] = []

    // Analyze device status
    devices?.forEach(device => {
      const lastSeenTime = device.last_seen ? new Date(device.last_seen) : null
      const minutesOffline = lastSeenTime 
        ? Math.floor((currentTime.getTime() - lastSeenTime.getTime()) / (1000 * 60))
        : Infinity

      const isOffline = minutesOffline > offlineThresholdMinutes
      
      const deviceStatus: DeviceStatus = {
        device_id: device.device_id,
        screen_id: device.id,
        screen_name: device.name,
        location_name: device.locations?.name || 'Unknown',
        last_seen: device.last_seen,
        minutes_offline: minutesOffline,
        status: isOffline ? 'offline' : 'online'
      }

      deviceStatuses.push(deviceStatus)
      
      if (isOffline) {
        offlineDevices.push(deviceStatus)
      }
    })

    // Get performance metrics from device health monitoring
    const { data: healthMetrics, error: healthError } = await supabase
      .from('device_health_metrics')
      .select(`
        *,
        screens!inner (
          name,
          device_id,
          locations!inner (name)
        )
      `)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .order('created_at', { ascending: false })

    const performanceIssues: PerformanceMetric[] = []
    
    if (!healthError && healthMetrics) {
      // Group by device and get latest metrics
      const latestMetrics = new Map<string, any>()
      
      healthMetrics.forEach(metric => {
        const deviceId = metric.screens?.device_id
        if (deviceId && (!latestMetrics.has(deviceId) || 
            new Date(metric.created_at) > new Date(latestMetrics.get(deviceId).created_at))) {
          latestMetrics.set(deviceId, metric)
        }
      })

      // Check for performance issues
      latestMetrics.forEach(metric => {
        const memoryUsage = metric.memory_usage || 0
        const storageUsage = metric.storage_usage || 0
        const cpuUsage = metric.cpu_usage || 0

        if (memoryUsage > 85 || storageUsage > 90 || cpuUsage > 90) {
          performanceIssues.push({
            device_id: metric.screens?.device_id,
            screen_id: metric.screen_id,
            screen_name: metric.screens?.name || 'Unknown',
            location_name: metric.screens?.locations?.name || 'Unknown',
            memory_usage: memoryUsage,
            storage_usage: storageUsage,
            cpu_usage: cpuUsage,
            last_reported: metric.created_at
          })
        }
      })
    }

    let alertsTriggered = 0

    // Trigger alerts if requested
    if (triggerAlerts) {
      // Check for recent alerts to avoid spam
      const { data: recentAlerts } = await supabase
        .from('device_alerts')
        .select('device_id, alert_type')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes

      const recentAlertKeys = new Set(
        recentAlerts?.map(a => `${a.device_id}-${a.alert_type}`) || []
      )

      // Trigger offline alerts
      for (const device of offlineDevices) {
        const alertKey = `${device.device_id}-device_offline`
        
        if (!recentAlertKeys.has(alertKey)) {
          try {
            const alertResponse = await fetch(
              `${request.nextUrl.origin}/api/devices/alerts`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  device_id: device.device_id,
                  alert_type: 'device_offline',
                  severity: device.minutes_offline > 60 ? 'critical' : 'high',
                  message: `Device "${device.screen_name}" has been offline for ${device.minutes_offline} minutes`,
                  details: {
                    last_seen: device.last_seen,
                    minutes_offline: device.minutes_offline,
                    location: device.location_name
                  },
                  metric_value: device.minutes_offline,
                  threshold: offlineThresholdMinutes
                })
              }
            )

            if (alertResponse.ok) {
              alertsTriggered++
            }
          } catch (error) {
            console.error(`Failed to create offline alert for ${device.device_id}:`, error)
          }
        }
      }

      // Trigger performance alerts
      for (const device of performanceIssues) {
        const issues = []
        if (device.memory_usage > 90) issues.push(`memory: ${device.memory_usage}%`)
        if (device.storage_usage > 95) issues.push(`storage: ${device.storage_usage}%`)
        if (device.cpu_usage > 90) issues.push(`CPU: ${device.cpu_usage}%`)

        if (issues.length > 0) {
          const alertKey = `${device.device_id}-performance_warning`
          
          if (!recentAlertKeys.has(alertKey)) {
            try {
              const severity = device.memory_usage > 95 || device.storage_usage > 98 ? 'critical' : 'high'
              
              const alertResponse = await fetch(
                `${request.nextUrl.origin}/api/devices/alerts`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    device_id: device.device_id,
                    alert_type: 'performance_warning',
                    severity,
                    message: `Performance warning for "${device.screen_name}": ${issues.join(', ')}`,
                    details: {
                      memory_usage: device.memory_usage,
                      storage_usage: device.storage_usage,
                      cpu_usage: device.cpu_usage,
                      location: device.location_name,
                      last_reported: device.last_reported
                    },
                    metric_value: Math.max(device.memory_usage, device.storage_usage, device.cpu_usage)
                  })
                }
              )

              if (alertResponse.ok) {
                alertsTriggered++
              }
            } catch (error) {
              console.error(`Failed to create performance alert for ${device.device_id}:`, error)
            }
          }
        }
      }
    }

    console.log(`Device monitoring completed: ${offlineDevices.length} offline, ${performanceIssues.length} performance issues, ${alertsTriggered} alerts triggered`)

    return NextResponse.json({
      success: true,
      monitoring_time: currentTime.toISOString(),
      summary: {
        total_devices: deviceStatuses.length,
        online_devices: deviceStatuses.filter(d => d.status === 'online').length,
        offline_devices: offlineDevices.length,
        performance_issues: performanceIssues.length,
        alerts_triggered: alertsTriggered
      },
      offline_devices: offlineDevices,
      performance_issues: performanceIssues,
      device_statuses: deviceStatuses
    })

  } catch (error) {
    console.error('Device monitoring error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// POST: Trigger immediate health check and alerts for specific device
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const body = await request.json()
    const { device_id } = body

    if (!device_id) {
      return NextResponse.json({ 
        error: 'device_id is required' 
      }, { status: 400 })
    }

    // Get device info
    const { data: device, error: deviceError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        last_seen,
        status,
        locations!inner (
          name
        )
      `)
      .eq('device_id', device_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ 
        error: 'Device not found' 
      }, { status: 404 })
    }

    // Check if device is offline
    const lastSeenTime = device.last_seen ? new Date(device.last_seen) : null
    const minutesOffline = lastSeenTime 
      ? Math.floor((new Date().getTime() - lastSeenTime.getTime()) / (1000 * 60))
      : Infinity

    const isOffline = minutesOffline > 30

    if (isOffline) {
      // Trigger immediate offline alert
      const alertResponse = await fetch(
        `${request.nextUrl.origin}/api/devices/alerts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: device.device_id,
            alert_type: 'device_offline',
            severity: minutesOffline > 60 ? 'critical' : 'high',
            message: `Manual health check: Device "${device.name}" has been offline for ${minutesOffline} minutes`,
            details: {
              last_seen: device.last_seen,
              minutes_offline: minutesOffline,
              location: device.locations?.name,
              triggered_by: 'manual_check'
            },
            metric_value: minutesOffline,
            threshold: 30
          })
        }
      )

      const alertSuccess = alertResponse.ok

      return NextResponse.json({
        success: true,
        device: {
          device_id: device.device_id,
          name: device.name,
          status: 'offline',
          minutes_offline: minutesOffline,
          last_seen: device.last_seen
        },
        alert_triggered: alertSuccess
      })
    } else {
      return NextResponse.json({
        success: true,
        device: {
          device_id: device.device_id,
          name: device.name,
          status: 'online',
          minutes_offline: minutesOffline,
          last_seen: device.last_seen
        },
        alert_triggered: false
      })
    }

  } catch (error) {
    console.error('Manual device check error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}