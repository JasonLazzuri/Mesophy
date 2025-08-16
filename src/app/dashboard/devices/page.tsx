'use client'

import { useEffect, useState } from 'react'
import { Monitor, Search, Wifi, WifiOff, AlertTriangle, Settings, Clock, Activity, Thermometer, HardDrive, Cpu, MemoryStick, RefreshCw } from 'lucide-react'
import Link from 'next/link'

interface DeviceStats {
  cpu_percent?: number
  memory_percent?: number
  disk_usage?: number
  temperature?: number
  uptime?: number
}

interface CacheStats {
  total_files?: number
  total_size_mb?: number
  cache_dir?: string
}

interface PlaylistInfo {
  current_index?: number
  playlist_size?: number
  current_state?: string
}

interface Device {
  id: string
  screen_id: string
  screen_name: string
  location_name: string
  district_name?: string
  status: 'online' | 'offline' | 'error' | 'maintenance'
  last_seen: string | null
  ip_address?: string
  system_info?: DeviceStats
  cache_stats?: CacheStats
  playlist_info?: PlaylistInfo
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices/status')
      if (!response.ok) throw new Error('Failed to fetch devices')
      
      const data = await response.json()
      setDevices(data.devices || [])
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDevices, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredDevices = devices.filter(device =>
    device.screen_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.location_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatUptime = (uptimeSeconds?: number) => {
    if (!uptimeSeconds) return 'Unknown'
    
    const days = Math.floor(uptimeSeconds / 86400)
    const hours = Math.floor((uptimeSeconds % 86400) / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never'
    
    const date = new Date(lastSeen)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
    return `${Math.floor(diffMinutes / 1440)}d ago`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <Wifi className="w-4 h-4 text-green-500" />
      case 'offline': return <WifiOff className="w-4 h-4 text-gray-400" />
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" />
      case 'maintenance': return <Settings className="w-4 h-4 text-yellow-500" />
      default: return <WifiOff className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800 border-green-200'
      case 'offline': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'error': return 'bg-red-100 text-red-800 border-red-200'
      case 'maintenance': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="w-6 h-6" />
            Device Management
          </h1>
          <p className="text-gray-600 mt-1">
            Monitor and manage Pi devices remotely
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={fetchDevices}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          
          <div className="text-xs text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Error loading devices</span>
          </div>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search devices by name, location, or device ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredDevices.length === 0 ? (
          <div className="p-8 text-center">
            <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No devices found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'No devices match your search criteria.' : 'No devices are currently registered.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredDevices.map((device) => (
              <div key={device.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(device.status)}
                      <h3 className="text-lg font-medium text-gray-900">
                        {device.screen_name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(device.status)}`}>
                        {device.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span>{device.location_name}</span>
                      {device.district_name && (
                        <>
                          <span>•</span>
                          <span>{device.district_name}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="font-mono text-xs">{device.id}</span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* System Stats */}
                      {device.system_info && (
                        <>
                          <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-blue-500" />
                            <span className="text-sm">
                              CPU: {device.system_info.cpu_percent?.toFixed(1) || 'N/A'}%
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <MemoryStick className="w-4 h-4 text-green-500" />
                            <span className="text-sm">
                              RAM: {device.system_info.memory_percent?.toFixed(1) || 'N/A'}%
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm">
                              Disk: {device.system_info.disk_usage?.toFixed(1) || 'N/A'}%
                            </span>
                          </div>
                          
                          {device.system_info.temperature && (
                            <div className="flex items-center gap-2">
                              <Thermometer className="w-4 h-4 text-red-500" />
                              <span className="text-sm">
                                {device.system_info.temperature.toFixed(1)}°C
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Cache Stats */}
                      {device.cache_stats && (
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-purple-500" />
                          <span className="text-sm">
                            Cache: {device.cache_stats.total_files || 0} files ({(device.cache_stats.total_size_mb || 0).toFixed(1)}MB)
                          </span>
                        </div>
                      )}
                      
                      {/* Playlist Info */}
                      {device.playlist_info && (
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-500" />
                          <span className="text-sm">
                            Playlist: {device.playlist_info.current_index || 0}/{device.playlist_info.playlist_size || 0}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="ml-4 text-right">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Clock className="w-4 h-4" />
                      {formatLastSeen(device.last_seen)}
                    </div>
                    
                    {device.system_info?.uptime && (
                      <div className="text-xs text-gray-500">
                        Uptime: {formatUptime(device.system_info.uptime)}
                      </div>
                    )}
                    
                    {device.ip_address && (
                      <div className="text-xs text-gray-500 font-mono mt-1">
                        {device.ip_address}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}