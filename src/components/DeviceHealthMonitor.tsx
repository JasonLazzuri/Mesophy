'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity, Cpu, HardDrive, Wifi, WifiOff, AlertCircle, CheckCircle, XCircle, Monitor, Thermometer, Clock, Zap } from 'lucide-react'

interface HealthMetrics {
  id: string
  device_id: string
  timestamp: string
  health_level: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'
  free_ram_percentage: number
  free_storage_percentage: number
  cpu_usage_percentage: number
  is_connected: boolean
  connection_type: string
  issues: string[]
  warnings: string[]
  device_model: string
  android_version: string
  app_version: string
  uptime_millis: number
}

interface HealthStatus {
  health_level: string
  last_seen: string
  free_ram_percentage: number
  free_storage_percentage: number
  cpu_usage_percentage: number
  is_online: boolean
  issues: string[]
  warnings: string[]
}

interface DeviceHealthProps {
  deviceId: string
  deviceName: string
}

export default function DeviceHealthMonitor({ deviceId, deviceName }: DeviceHealthProps) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [healthHistory, setHealthHistory] = useState<HealthMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchHealthData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      setError(null)

      // Fetch health data from our API
      const response = await fetch(`/api/devices/health?device_id=${deviceId}&hours=6`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch health data: ${response.status}`)
      }

      const data = await response.json()
      
      setHealthStatus(data.current_status)
      setHealthHistory(data.history || [])

    } catch (err) {
      console.error('Error fetching health data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load health data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchHealthData()
    
    // Refresh health data every 30 seconds
    const interval = setInterval(() => {
      fetchHealthData()
    }, 30000)

    return () => clearInterval(interval)
  }, [deviceId])

  const getHealthIcon = (level: string) => {
    switch (level) {
      case 'HEALTHY':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'WARNING':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'CRITICAL':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Activity className="w-5 h-5 text-gray-400" />
    }
  }

  const getHealthColor = (level: string) => {
    switch (level) {
      case 'HEALTHY':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'WARNING':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'CRITICAL':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600'
    }
  }

  const formatUptime = (uptimeMillis: number) => {
    const hours = Math.floor(uptimeMillis / (1000 * 60 * 60))
    const minutes = Math.floor((uptimeMillis % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            <div className="h-5 w-5 bg-gray-200 rounded"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold">Device Health - {deviceName}</h3>
          <button
            onClick={() => fetchHealthData(true)}
            disabled={refreshing}
            className="ml-auto p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <Activity className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-3">{error}</p>
          <button
            onClick={() => fetchHealthData(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!healthStatus) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold">Device Health - {deviceName}</h3>
        </div>
        <div className="text-center py-8">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No health data available</p>
          <p className="text-sm text-gray-500 mt-2">
            Health metrics will appear once the device reports them
          </p>
        </div>
      </div>
    )
  }

  const timeSinceLastSeen = healthStatus.last_seen 
    ? Math.floor((new Date().getTime() - new Date(healthStatus.last_seen).getTime()) / 1000)
    : null

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold">Device Health - {deviceName}</h3>
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getHealthColor(healthStatus.health_level)}`}>
            {getHealthIcon(healthStatus.health_level)}
            {healthStatus.health_level}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            {healthStatus.is_online ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Online
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                Offline {timeSinceLastSeen && `(${Math.floor(timeSinceLastSeen / 60)}m ago)`}
              </div>
            )}
          </div>
          <button
            onClick={() => fetchHealthData(true)}
            disabled={refreshing}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <Activity className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Memory Usage */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Memory</span>
            </div>
            <div className="text-2xl font-bold text-blue-800">
              {Math.round((1 - healthStatus.free_ram_percentage) * 100)}%
            </div>
            <div className="text-sm text-blue-600">
              {Math.round(healthStatus.free_ram_percentage * 100)}% free
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(1 - healthStatus.free_ram_percentage) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Storage Usage */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4 text-green-600" />
              <span className="font-medium text-green-900">Storage</span>
            </div>
            <div className="text-2xl font-bold text-green-800">
              {Math.round((1 - healthStatus.free_storage_percentage) * 100)}%
            </div>
            <div className="text-sm text-green-600">
              {Math.round(healthStatus.free_storage_percentage * 100)}% free
            </div>
            <div className="w-full bg-green-200 rounded-full h-2 mt-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(1 - healthStatus.free_storage_percentage) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* CPU Usage */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-purple-600" />
              <span className="font-medium text-purple-900">CPU</span>
            </div>
            <div className="text-2xl font-bold text-purple-800">
              {Math.round(healthStatus.cpu_usage_percentage)}%
            </div>
            <div className="text-sm text-purple-600">usage</div>
            <div className="w-full bg-purple-200 rounded-full h-2 mt-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${healthStatus.cpu_usage_percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Issues and Warnings */}
        {(healthStatus.issues?.length > 0 || healthStatus.warnings?.length > 0) && (
          <div className="space-y-3 mb-6">
            {healthStatus.issues?.map((issue, index) => (
              <div key={`issue-${index}`} className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-red-800 text-sm">{issue}</span>
              </div>
            ))}
            {healthStatus.warnings?.map((warning, index) => (
              <div key={`warning-${index}`} className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <span className="text-yellow-800 text-sm">{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Last Updated */}
        <div className="flex items-center justify-between text-sm text-gray-500 border-t pt-4">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Last updated: {formatTimestamp(healthStatus.last_seen)}
          </div>
          {healthHistory.length > 0 && (
            <span>{healthHistory.length} readings in last 6 hours</span>
          )}
        </div>
      </div>
    </div>
  )
}