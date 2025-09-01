'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DeviceHealthMonitor from '@/components/DeviceHealthMonitor'
import { Activity, AlertCircle, CheckCircle, XCircle, Monitor, RefreshCw } from 'lucide-react'

interface Device {
  id: string
  screen_id: string
  name: string
  location?: {
    name: string
    district?: {
      name: string
    }
  }
}

interface HealthOverview {
  deviceId: string
  deviceName: string
  healthLevel: string
  lastSeen: string
  isOnline: boolean
  issueCount: number
  warningCount: number
}

export default function HealthDashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const [healthOverview, setHealthOverview] = useState<HealthOverview[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = async () => {
    try {
      setError(null)
      const supabase = createClient()

      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select(`
          id,
          screen_id,
          name,
          location:locations (
            name,
            district:districts (
              name
            )
          )
        `)
        .order('name')

      if (devicesError) {
        throw devicesError
      }

      setDevices(devicesData || [])

      // Fetch health overview for each device
      const healthPromises = (devicesData || []).map(async (device) => {
        try {
          const response = await fetch(`/api/devices/health?device_id=${device.id}&hours=1`)
          if (response.ok) {
            const healthData = await response.json()
            const status = healthData.current_status
            
            return {
              deviceId: device.id,
              deviceName: device.name,
              healthLevel: status?.health_level || 'UNKNOWN',
              lastSeen: status?.last_seen || '',
              isOnline: status?.is_online || false,
              issueCount: status?.issues?.length || 0,
              warningCount: status?.warnings?.length || 0
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch health for device ${device.name}:`, err)
        }
        
        return {
          deviceId: device.id,
          deviceName: device.name,
          healthLevel: 'UNKNOWN',
          lastSeen: '',
          isOnline: false,
          issueCount: 0,
          warningCount: 0
        }
      })

      const healthResults = await Promise.all(healthPromises)
      setHealthOverview(healthResults)

    } catch (err) {
      console.error('Error fetching devices:', err)
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchDevices, 60000)
    return () => clearInterval(interval)
  }, [])

  const getHealthStats = () => {
    const stats = healthOverview.reduce(
      (acc, device) => {
        if (device.healthLevel === 'HEALTHY') acc.healthy++
        else if (device.healthLevel === 'WARNING') acc.warning++
        else if (device.healthLevel === 'CRITICAL') acc.critical++
        else acc.unknown++
        
        if (device.isOnline) acc.online++
        else acc.offline++
        
        return acc
      },
      { healthy: 0, warning: 0, critical: 0, unknown: 0, online: 0, offline: 0 }
    )
    return stats
  }

  const getHealthIcon = (level: string) => {
    switch (level) {
      case 'HEALTHY':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'WARNING':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'CRITICAL':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-400" />
    }
  }

  const getHealthColor = (level: string) => {
    switch (level) {
      case 'HEALTHY':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Health Dashboard</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchDevices}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const stats = getHealthStats()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Health Dashboard</h1>
          <p className="text-gray-600">Monitor the health and status of all your digital signage devices</p>
        </div>
        <button
          onClick={fetchDevices}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Health Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-green-900">Healthy</span>
          </div>
          <div className="text-2xl font-bold text-green-800">{stats.healthy}</div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-900">Warning</span>
          </div>
          <div className="text-2xl font-bold text-yellow-800">{stats.warning}</div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-900">Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-800">{stats.critical}</div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-blue-900">Online</span>
          </div>
          <div className="text-2xl font-bold text-blue-800">{stats.online}/{devices.length}</div>
        </div>
      </div>

      {/* Device List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900">All Devices</h3>
          </div>
          <div className="p-4">
            {healthOverview.length === 0 ? (
              <div className="text-center py-8">
                <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No devices found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {healthOverview.map((device) => (
                  <div
                    key={device.deviceId}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDevice === device.deviceId
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedDevice(device.deviceId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getHealthIcon(device.healthLevel)}
                        <div>
                          <div className="font-medium text-gray-900">{device.deviceName}</div>
                          <div className="text-sm text-gray-500">
                            {device.isOnline ? 'Online' : 'Offline'}
                            {device.lastSeen && ` • ${new Date(device.lastSeen).toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getHealthColor(device.healthLevel)}`}>
                        {device.healthLevel}
                      </div>
                    </div>
                    {(device.issueCount > 0 || device.warningCount > 0) && (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {device.issueCount > 0 && (
                          <span className="text-red-600">{device.issueCount} issues</span>
                        )}
                        {device.warningCount > 0 && (
                          <span className="text-yellow-600">{device.warningCount} warnings</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Device Health Details */}
        <div>
          {selectedDevice ? (
            <DeviceHealthMonitor
              deviceId={selectedDevice}
              deviceName={devices.find(d => d.id === selectedDevice)?.name || 'Unknown Device'}
            />
          ) : (
            <div className="bg-white rounded-lg border p-8 text-center">
              <Monitor className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Device</h3>
              <p className="text-gray-600">Choose a device from the list to view detailed health metrics</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}