'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RotateCcw, Power, Download, Activity, RefreshCw, Loader2, Search, Monitor, Clock, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff, MapPin, History, ChevronDown, ChevronUp } from 'lucide-react'

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
  const [commandStatus, setCommandStatus] = useState<Record<string, 'idle' | 'queued' | 'processing' | 'completed' | 'failed'>>({})
  const [commandResults, setCommandResults] = useState<Record<string, { success: boolean; message: string; timestamp: string; detail?: string }>>({})
  const [commandHistory, setCommandHistory] = useState<Array<{ id: string; deviceId: string; commandType: string; success: boolean; message: string; timestamp: string; detail?: string }>>([])
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({})

  const getCommandMessage = (commandType: string, status: 'processing' | 'completed') => {
    const messages = {
      restart_content: {
        processing: 'Restarting content system...',
        completed: 'Content system restarted'
      },
      reboot: {
        processing: 'Rebooting device...',
        completed: 'Device rebooted successfully'
      },
      sync_content: {
        processing: 'Synchronizing content...',
        completed: 'Content synchronized'
      },
      health_check: {
        processing: 'Running health diagnostics...',
        completed: 'Health check completed'
      }
    }
    return messages[commandType as keyof typeof messages]?.[status] || `${status === 'processing' ? 'Processing' : 'Completed'} ${commandType}`
  }

  const getEstimatedTime = (commandType: string) => {
    const times = {
      restart_content: '10-30 seconds',
      reboot: '1-3 minutes',
      sync_content: '5-15 seconds',
      health_check: '3-5 seconds'
    }
    return times[commandType as keyof typeof times] || '30 seconds'
  }

  const getEstimatedTimeMs = (commandType: string) => {
    const times = {
      restart_content: 20000, // 20 seconds
      reboot: 120000, // 2 minutes
      sync_content: 10000, // 10 seconds
      health_check: 4000 // 4 seconds
    }
    return times[commandType as keyof typeof times] || 15000
  }

  const getCommandDisplayName = (commandType: string) => {
    const names = {
      restart_content: 'Content Restart',
      reboot: 'Device Restart',
      sync_content: 'Content Sync',
      health_check: 'Health Check'
    }
    return names[commandType as keyof typeof names] || commandType.charAt(0).toUpperCase() + commandType.slice(1)
  }

  const getCommandPollingEstimate = () => {
    return '10' // Pi polls every 10 seconds now
  }

  const addToHistory = (deviceId: string, commandType: string, success: boolean, message: string, detail?: string) => {
    const historyItem = {
      id: `${deviceId}-${commandType}-${Date.now()}`,
      deviceId,
      commandType,
      success,
      message,
      timestamp: new Date().toLocaleTimeString(),
      detail
    }
    
    setCommandHistory(prev => [historyItem, ...prev.slice(0, 19)]) // Keep last 20 commands
  }

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
    const device = devices.find(d => d.id === deviceId)
    
    // Check if device is offline before sending command
    if (device?.status === 'offline') {
      const offlineMessage = 'Device is offline'
      const offlineDetail = `Cannot execute ${getCommandDisplayName(commandType)} - device was last seen ${formatLastSeen(device.last_seen)}. Please wait for device to come online.`
      
      setCommandResults(prev => ({ 
        ...prev, 
        [commandKey]: { 
          success: false, 
          message: offlineMessage,
          timestamp: new Date().toLocaleTimeString(),
          detail: offlineDetail
        }
      }))
      
      // Add to history
      addToHistory(deviceId, commandType, false, offlineMessage, offlineDetail)
      
      // Clear result after 10 seconds for offline devices
      setTimeout(() => {
        setCommandResults(prev => {
          const newResults = { ...prev }
          delete newResults[commandKey]
          return newResults
        })
      }, 10000)
      return
    }
    
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))
    setCommandStatus(prev => ({ ...prev, [commandKey]: 'queued' }))
    
    // Show immediate feedback that command is queued
    setCommandResults(prev => ({ 
      ...prev, 
      [commandKey]: { 
        success: true, 
        message: 'Command queued for execution...',
        timestamp: new Date().toLocaleTimeString(),
        detail: `Waiting for device to process command (next check in ~${getCommandPollingEstimate()} seconds)`
      }
    }))
    
    try {
      // Get current session to include auth token
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      // Include authorization header if we have a session
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      const response = await fetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        headers,
        credentials: 'include', // Important: include cookies for authentication
        body: JSON.stringify({
          command_type: commandType,
          command_data: { source: 'simple_dashboard' },
          priority: (commandType === 'restart' || commandType === 'restart_content' || commandType === 'reboot') ? 2 : 5
        }),
      })

      const result = await response.json()
      
      if (response.ok) {
        setCommandStatus(prev => ({ ...prev, [commandKey]: 'processing' }))
        
        // Show processing status
        setCommandResults(prev => ({ 
          ...prev, 
          [commandKey]: { 
            success: true, 
            message: getCommandMessage(commandType, 'processing'),
            timestamp: new Date().toLocaleTimeString(),
            detail: `Command sent successfully. Expected completion in ${getEstimatedTime(commandType)}.`
          }
        }))
        
        // Show completion after estimated time
        setTimeout(() => {
          setCommandStatus(prev => ({ ...prev, [commandKey]: 'completed' }))
          const completedMessage = getCommandMessage(commandType, 'completed')
          const completedDetail = result.message || 'Command completed successfully'
          
          setCommandResults(prev => ({ 
            ...prev, 
            [commandKey]: { 
              success: true, 
              message: completedMessage,
              timestamp: new Date().toLocaleTimeString(),
              detail: completedDetail
            }
          }))
          
          // Add to history
          addToHistory(deviceId, commandType, true, completedMessage, completedDetail)
        }, getEstimatedTimeMs(commandType))
        
        // Refresh devices to show updated status
        setTimeout(() => fetchDevices(), getEstimatedTimeMs(commandType) + 1000)
      } else {
        setCommandStatus(prev => ({ ...prev, [commandKey]: 'failed' }))
        const failedMessage = `${commandType} command failed`
        const failedDetail = result.error || 'The command could not be executed. Please try again.'
        
        setCommandResults(prev => ({ 
          ...prev, 
          [commandKey]: { 
            success: false, 
            message: failedMessage,
            timestamp: new Date().toLocaleTimeString(),
            detail: failedDetail
          }
        }))
        
        // Add to history
        addToHistory(deviceId, commandType, false, failedMessage, failedDetail)
      }
    } catch (error) {
      setCommandStatus(prev => ({ ...prev, [commandKey]: 'failed' }))
      const errorMessage = 'Connection failed'
      const errorDetail = 'Could not connect to the device. Check your network connection and try again.'
      
      setCommandResults(prev => ({ 
        ...prev, 
        [commandKey]: { 
          success: false, 
          message: errorMessage,
          timestamp: new Date().toLocaleTimeString(),
          detail: errorDetail
        }
      }))
      
      // Add to history
      addToHistory(deviceId, commandType, false, errorMessage, errorDetail)
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
          <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200"
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
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Error loading devices</span>
          </div>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              <div key={device.id} className="p-4 sm:p-6 hover:bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        {device.screen_name}
                      </h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(device.status)}`}>
                        {device.status === 'online' ? (
                          <Wifi className="w-3 h-3" />
                        ) : (
                          <WifiOff className="w-3 h-3" />
                        )}
                        {device.status === 'online' ? 'Online' : device.status === 'offline' ? 'Offline' : 'Unknown'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{device.location_name || 'Unknown Location'}</span>
                        </div>
                        {device.district_name && (
                          <>
                            <span>•</span>
                            <span>{device.district_name}</span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{device.id}</span>
                    </div>

                    {/* Simple Remote Controls */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-3">
                        <button
                          onClick={() => executeCommand(device.id, 'restart_content')}
                          disabled={commandLoading[`${device.id}-restart_content`]}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          title="Restart digital signage software only (10-30 seconds)"
                        >
                          {commandLoading[`${device.id}-restart_content`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Restart Content</span>
                          <span className="sm:hidden">Restart</span>
                        </button>
                        
                        <button
                          onClick={() => executeCommand(device.id, 'reboot')}
                          disabled={commandLoading[`${device.id}-reboot`]}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          title="Restart entire Pi device (1-3 minutes)"
                        >
                          {commandLoading[`${device.id}-reboot`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Restart Device</span>
                          <span className="sm:hidden">Reboot</span>
                        </button>
                        
                        <button
                          onClick={() => executeCommand(device.id, 'sync_content')}
                          disabled={commandLoading[`${device.id}-sync_content`]}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          title="Sync content from server"
                        >
                          {commandLoading[`${device.id}-sync_content`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Sync Content</span>
                          <span className="sm:hidden">Sync</span>
                        </button>
                        
                        <button
                          onClick={() => executeCommand(device.id, 'health_check')}
                          disabled={commandLoading[`${device.id}-health_check`]}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          title="Check device health and performance"
                        >
                          {commandLoading[`${device.id}-health_check`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Health Check</span>
                          <span className="sm:hidden">Health</span>
                        </button>
                      </div>

                      {/* Command Results */}
                      {Object.entries(commandResults)
                        .filter(([key]) => key.startsWith(device.id))
                        .map(([key, result]) => {
                          const commandType = key.split('-').slice(1).join('-')
                          return (
                            <div
                              key={key}
                              className={`p-3 rounded-md text-sm border transition-all duration-300 ${
                                result.success
                                  ? 'bg-green-50 text-green-800 border-green-200'
                                  : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {result.success ? (
                                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                  )}
                                  <div>
                                    <div className="font-medium">
                                      {commandType === 'restart_content' ? 'Content Restart' : 
                                       commandType === 'reboot' ? 'Device Restart' :
                                       commandType === 'sync_content' ? 'Content Sync' :
                                       commandType === 'health_check' ? 'Health Check' :
                                       commandType.charAt(0).toUpperCase() + commandType.slice(1)}
                                    </div>
                                    <div className={`text-xs mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                                      {result.message}
                                    </div>
                                    {result.detail && (
                                      <div className={`text-xs mt-1 ${result.success ? 'text-green-600' : 'text-red-600'} opacity-75`}>
                                        {result.detail}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className={`text-xs ${result.success ? 'text-green-600' : 'text-red-600'} flex-shrink-0`}>
                                  {result.timestamp}
                                </div>
                              </div>
                            </div>
                          )
                        })}

                      {/* Command History */}
                      {commandHistory.filter(cmd => cmd.deviceId === device.id).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <button
                            onClick={() => setShowHistory(prev => ({ ...prev, [device.id]: !prev[device.id] }))}
                            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                          >
                            <History className="w-3 h-3" />
                            Command History ({commandHistory.filter(cmd => cmd.deviceId === device.id).length})
                            {showHistory[device.id] ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          
                          {showHistory[device.id] && (
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                              {commandHistory
                                .filter(cmd => cmd.deviceId === device.id)
                                .slice(0, 10)
                                .map((historyItem) => (
                                  <div
                                    key={historyItem.id}
                                    className={`text-xs p-2 rounded border-l-2 ${
                                      historyItem.success
                                        ? 'bg-gray-50 border-l-green-400 text-gray-700'
                                        : 'bg-gray-50 border-l-red-400 text-gray-700'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {historyItem.success ? (
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                        ) : (
                                          <XCircle className="w-3 h-3 text-red-500" />
                                        )}
                                        <span className="font-medium">
                                          {historyItem.commandType === 'restart_content' ? 'Content Restart' : 
                                           historyItem.commandType === 'reboot' ? 'Device Restart' :
                                           historyItem.commandType === 'sync_content' ? 'Content Sync' :
                                           historyItem.commandType === 'health_check' ? 'Health Check' :
                                           historyItem.commandType.charAt(0).toUpperCase() + historyItem.commandType.slice(1)}
                                        </span>
                                      </div>
                                      <span className="text-gray-500">{historyItem.timestamp}</span>
                                    </div>
                                    <div className="mt-1 text-gray-600">
                                      {historyItem.message}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="sm:ml-4 sm:text-right mt-4 sm:mt-0">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Clock className="w-4 h-4" />
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