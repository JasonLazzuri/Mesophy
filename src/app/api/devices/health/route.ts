import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/devices/health
 * 
 * Receive and store device health metrics from Android TV clients
 */
export async function POST(request: NextRequest) {
  try {
    // Get device authentication
    const deviceToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    const screenId = request.headers.get('X-Screen-ID')
    
    if (!deviceToken) {
      return new NextResponse('Unauthorized - Device token required', { status: 401 })
    }
    
    // Parse health metrics from request body
    const healthMetrics = await request.json()
    
    console.log('Health metrics received from device:', screenId)
    console.log('Metrics summary:', {
      timestamp: healthMetrics.timestamp,
      healthLevel: healthMetrics.healthStatus?.overall,
      freeRAM: healthMetrics.memoryInfo?.freeRAMPercentage,
      freeStorage: healthMetrics.storageInfo?.freeStoragePercentage,
      cpuUsage: healthMetrics.cpuInfo?.cpuUsagePercentage
    })
    
    // Get Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing Supabase configuration')
      return new NextResponse('Server configuration error', { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Find the screen by screen_id from header
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('id, name, device_id, location_id, locations(name)')
      .eq('id', screenId)
      .single()
    
    if (screenError || !screen) {
      console.error('Screen not found for ID:', screenId, screenError)
      return new NextResponse('Device not found', { status: 404 })
    }
    
    console.log('Screen found:', screen.name, 'ID:', screen.id)
    
    // Transform Android health metrics to database format
    const dbHealthMetrics = {
      device_id: screen.device_id,
      screen_id: screenId,
      timestamp: new Date(healthMetrics.timestamp).toISOString(),
      
      // Device Information
      device_model: healthMetrics.deviceInfo?.model,
      device_manufacturer: healthMetrics.deviceInfo?.manufacturer,
      android_version: healthMetrics.deviceInfo?.androidVersion,
      api_level: healthMetrics.deviceInfo?.apiLevel,
      app_version: healthMetrics.appInfo?.appVersion,
      
      // Memory Metrics
      total_ram: healthMetrics.memoryInfo?.totalRAM,
      available_ram: healthMetrics.memoryInfo?.availableRAM,
      used_ram: healthMetrics.memoryInfo?.usedRAM,
      free_ram_percentage: healthMetrics.memoryInfo?.freeRAMPercentage,
      low_memory: healthMetrics.memoryInfo?.lowMemory,
      
      // Storage Metrics
      total_storage: healthMetrics.storageInfo?.totalStorage,
      available_storage: healthMetrics.storageInfo?.availableStorage,
      used_storage: healthMetrics.storageInfo?.usedStorage,
      free_storage_percentage: healthMetrics.storageInfo?.freeStoragePercentage,
      
      // Network Metrics
      is_connected: healthMetrics.networkInfo?.isConnected,
      connection_type: healthMetrics.networkInfo?.connectionType,
      signal_strength: healthMetrics.networkInfo?.signalStrength,
      
      // CPU Metrics
      cpu_usage_percentage: healthMetrics.cpuInfo?.cpuUsagePercentage,
      core_count: healthMetrics.cpuInfo?.coreCount,
      
      // App Metrics
      uptime_millis: healthMetrics.appInfo?.uptimeMillis,
      last_restart_time: healthMetrics.appInfo?.lastRestartTime ? 
        new Date(healthMetrics.appInfo.lastRestartTime).toISOString() : null,
      app_memory_usage: healthMetrics.appInfo?.memoryUsage,
      thread_count: healthMetrics.appInfo?.threadCount,
      
      // Health Status
      health_level: healthMetrics.healthStatus?.overall || 'UNKNOWN',
      issues: healthMetrics.healthStatus?.issues || [],
      warnings: healthMetrics.healthStatus?.warnings || []
    }
    
    // Insert health metrics into database
    const { data: insertedMetrics, error: insertError } = await supabase
      .from('device_health_metrics')
      .insert([dbHealthMetrics])
      .select()
    
    if (insertError) {
      console.error('Failed to insert health metrics:', insertError)
      return new NextResponse('Failed to store health metrics', { status: 500 })
    }
    
    console.log('Health metrics stored successfully for screen:', screen.name)
    
    // Check if we need to create any alerts based on health status
    const alerts = []
    
    if (healthMetrics.healthStatus?.overall === 'CRITICAL') {
      alerts.push({
        type: 'critical_health',
        message: `Screen ${screen.name} is in critical health state`,
        details: healthMetrics.healthStatus.issues.join(', ')
      })
    }
    
    if (healthMetrics.memoryInfo?.freeRAMPercentage < 0.1) {
      alerts.push({
        type: 'low_memory',
        message: `Screen ${screen.name} has critically low memory`,
        details: `${Math.round(healthMetrics.memoryInfo.freeRAMPercentage * 100)}% free RAM`
      })
    }
    
    if (healthMetrics.storageInfo?.freeStoragePercentage < 0.05) {
      alerts.push({
        type: 'low_storage', 
        message: `Screen ${screen.name} has critically low storage`,
        details: `${Math.round(healthMetrics.storageInfo.freeStoragePercentage * 100)}% free storage`
      })
    }
    
    // Return success response with any alerts
    return NextResponse.json({
      success: true,
      message: 'Health metrics received successfully',
      device_name: screen.name,
      health_level: healthMetrics.healthStatus?.overall,
      alerts: alerts,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Error processing health metrics:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

/**
 * GET /api/devices/health?device_id=xxx&hours=24
 * 
 * Get health metrics history for a device
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')
    const hours = parseInt(searchParams.get('hours') || '24')
    
    if (!deviceId) {
      return new NextResponse('Device ID required', { status: 400 })
    }
    
    // Get Supabase client  
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      return new NextResponse('Server configuration error', { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Get health history using the database function
    const { data: healthHistory, error } = await supabase
      .rpc('get_device_health_history', {
        device_uuid: deviceId,
        hours_back: hours
      })
    
    if (error) {
      console.error('Failed to get health history:', error)
      return new NextResponse('Failed to get health history', { status: 500 })
    }
    
    // Get latest status
    const { data: currentStatus, error: statusError } = await supabase
      .rpc('get_device_health_status', {
        device_uuid: deviceId
      })
    
    if (statusError) {
      console.error('Failed to get current health status:', statusError)
    }
    
    return NextResponse.json({
      device_id: deviceId,
      current_status: currentStatus?.[0] || null,
      history: healthHistory || [],
      hours_requested: hours,
      total_records: healthHistory?.length || 0
    })
    
  } catch (error) {
    console.error('Error getting health metrics:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Screen-ID',
    },
  })
}