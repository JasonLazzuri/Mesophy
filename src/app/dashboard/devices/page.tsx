'use client'

import { useEffect, useState } from 'react'
// Simplified without lucide-react icons to avoid React error #130

interface Device {
  id: string
  screen_id: string
  screen_name: string
  location_name: string
  district_name?: string
  status: string
  last_seen?: string
  ip_address?: string
}

export default function SimpleDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [commandLoading, setCommandLoading] = useState<Record<string, boolean>>({})
  const [commandResults, setCommandResults] = useState<Record<string, { success: boolean; message: string; timestamp: string }>>({})

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices/status')
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to fetch devices')
      }
      
      const data = await response.json()
      const validDevices = Array.isArray(data.devices) 
        ? data.devices.filter((device: any) => 
            device && 
            typeof device.id === 'string' && 
            typeof device.screen_name === 'string'
          )
        : []
      
      setDevices(validDevices)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setDevices([])
      console.error('Device fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Remote control function
  const executeCommand = async (deviceId: string, commandType: string) => {
    const commandKey = `${deviceId}-${commandType}`
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))
    
    try {
      const response = await fetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_type: commandType,
          command_data: { source: 'simple_dashboard' },
          priority: commandType === 'restart' ? 2 : 5
        }),
      })

      const result = await response.json()
      
      if (response.ok) {
        setCommandResults(prev => ({ 
          ...prev, 
          [commandKey]: { 
            success: true, 
            message: result.message || 'Command executed successfully',
            timestamp: new Date().toLocaleTimeString()
          }
        }))
        
        // Refresh devices to show updated status
        setTimeout(() => fetchDevices(), 2000)
      } else {
        setCommandResults(prev => ({ 
          ...prev, 
          [commandKey]: { 
            success: false, 
            message: result.error || 'Command failed',
            timestamp: new Date().toLocaleTimeString()
          }
        }))
      }
    } catch (error) {
      setCommandResults(prev => ({ 
        ...prev, 
        [commandKey]: { 
          success: false, 
          message: 'Network error',
          timestamp: new Date().toLocaleTimeString()
        }
      }))
    } finally {
      setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
      
      // Clear result after 5 seconds
      setTimeout(() => {
        setCommandResults(prev => {
          const newResults = { ...prev }
          delete newResults[commandKey]
          return newResults
        })
      }, 5000)
    }
  }

  useEffect(() => {
    fetchDevices()
    const interval = setInterval(fetchDevices, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredDevices = devices.filter(device =>
    device.screen_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.location_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'offline':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Never'
    try {
      return new Date(lastSeen).toLocaleString()
    } catch {
      return 'Invalid date'
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="w-8 h-8 text-gray-400 mx-auto mb-4">🔄</div>
          <p>Loading devices...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <p className="text-gray-600 mt-1">
            Monitor and manage your digital signage devices
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={fetchDevices}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <span>🔄</span>
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
            <span>⚠️</span>
            <span className="font-medium">Error loading devices</span>
          </div>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
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
            <div className="w-12 h-12 text-gray-400 mx-auto mb-4 text-center text-4xl">📺</div>
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
                      <h3 className="text-lg font-medium text-gray-900">
                        {device.screen_name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(device.status)}`}>
                        {device.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span>{device.location_name || 'Unknown Location'}</span>
                      {device.district_name && (
                        <>
                          <span>•</span>
                          <span>{device.district_name}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="font-mono text-xs">{device.id}</span>
                    </div>

                    {/* Simple Remote Controls */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button
                          onClick={() => executeCommand(device.id, 'restart')}
                          disabled={commandLoading[`${device.id}-restart`]}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {commandLoading[`${device.id}-restart`] ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>🔄</span>
                          )}
                          Restart
                        </button>
                        
                        <button
                          onClick={() => executeCommand(device.id, 'sync_content')}
                          disabled={commandLoading[`${device.id}-sync_content`]}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {commandLoading[`${device.id}-sync_content`] ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>🔄</span>
                          )}
                          Sync
                        </button>
                        
                        <button
                          onClick={() => executeCommand(device.id, 'health_check')}
                          disabled={commandLoading[`${device.id}-health_check`]}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {commandLoading[`${device.id}-health_check`] ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>❤️</span>
                          )}
                          Health
                        </button>
                      </div>

                      {/* Command Results */}
                      {Object.entries(commandResults)
                        .filter(([key]) => key.startsWith(device.id))
                        .map(([key, result]) => (
                          <div
                            key={key}
                            className={`p-2 rounded text-xs ${
                              result.success
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{result.message}</span>
                              <span className="text-gray-500">{result.timestamp}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                  
                  <div className="ml-4 text-right">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <span>🕐</span>
                      {formatLastSeen(device.last_seen)}
                    </div>
                    
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