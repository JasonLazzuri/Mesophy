'use client'

import { useEffect, useState } from 'react'
import { Monitor, Search, Plus, Edit, Building2, MapPin, Wifi, WifiOff, AlertTriangle, Settings, Clock, Activity, Smartphone, QrCode, PlayCircle, Pause, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'
import EnterPairingCodeModal from '@/components/EnterPairingCodeModal'
import Toast from '@/components/Toast'
import { useAuth } from '@/hooks/useAuth'

interface Screen {
  id: string
  location_id: string
  name: string
  screen_type: ScreenType
  device_id: string | null
  device_status: DeviceStatus
  device_token: string | null
  device_info: any
  last_sync_at: string | null
  resolution: string
  orientation: Orientation
  is_active: boolean
  last_seen: string | null
  created_at: string
  updated_at: string
  location?: {
    id: string
    name: string
    district?: {
      id: string
      name: string
    } | null
  } | null
}

interface ScreensByLocation {
  [locationName: string]: {
    location: {
      id: string
      name: string
      district?: {
        id: string
        name: string
      } | null
    }
    screens: Screen[]
  }
}

export default function ScreensPage() {
  const { isTech } = useAuth()
  const [screens, setScreens] = useState<Screen[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ScreenType | 'all'>('all')
  const [error, setError] = useState('')
  const [enterCodeModalOpen, setEnterCodeModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<{ [screenId: string]: string }>({}) // Track loading state for actions
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info', title: string, message?: string } | null>(null)

  useEffect(() => {
    fetchScreens()
  }, [])

  const fetchScreens = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (typeFilter !== 'all') params.append('type', typeFilter)
      
      const response = await fetch(`/api/screens?${params.toString()}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch screens')
      }

      setScreens(result.screens || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch screens')
      console.error('Error fetching screens:', err)
    } finally {
      setLoading(false)
    }
  }


  const handleDeviceAction = async (screenId: string, action: 'restart' | 'pause' | 'resume') => {
    setActionLoading(prev => ({ ...prev, [screenId]: action }))
    
    try {
      const response = await fetch(`/api/screens/${screenId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_action: action })
      })
      
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || `Failed to ${action} device`)
      }
      
      // Refresh screens data
      setTimeout(fetchScreens, 1000) // Give device time to respond
      setToast({
        type: 'success',
        title: `Device ${action} command sent`,
        message: 'The device should respond within a few seconds.'
      })
    } catch (error) {
      console.error(`Error ${action}ing device:`, error)
      setToast({
        type: 'error',
        title: `Failed to ${action} device`,
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      })
    } finally {
      setActionLoading(prev => ({ ...prev, [screenId]: '' }))
    }
  }

  // Filter screens based on search term
  const filteredScreens = screens.filter(screen =>
    screen.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    screen.device_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    screen.location?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    screen.location?.district?.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group screens by location and district
  const screensByLocation: ScreensByLocation = filteredScreens.reduce((acc, screen) => {
    const locationKey = screen.location?.name || 'Unknown Location'
    
    if (!acc[locationKey]) {
      acc[locationKey] = {
        location: screen.location || { id: '', name: locationKey },
        screens: []
      }
    }
    
    acc[locationKey].screens.push(screen)
    return acc
  }, {} as ScreensByLocation)

  // Sort locations by district name, then location name
  const sortedLocationKeys = Object.keys(screensByLocation).sort((a, b) => {
    const locationA = screensByLocation[a].location
    const locationB = screensByLocation[b].location
    const districtA = locationA.district?.name || ''
    const districtB = locationB.district?.name || ''
    
    if (districtA !== districtB) {
      return districtA.localeCompare(districtB)
    }
    return a.localeCompare(b)
  })

  const getStatusIcon = (status: DeviceStatus, lastSeen: string | null) => {
    const isStale = lastSeen ? 
      (new Date().getTime() - new Date(lastSeen).getTime()) > 300000 : true // 5 minutes
    
    switch (status) {
      case 'online':
        return isStale ? 
          <WifiOff className="h-4 w-4 text-orange-500" /> : 
          <Wifi className="h-4 w-4 text-green-500" />
      case 'offline':
        return <WifiOff className="h-4 w-4 text-gray-400" />
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'maintenance':
        return <Settings className="h-4 w-4 text-blue-500" />
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: DeviceStatus, lastSeen: string | null) => {
    const isStale = lastSeen ? 
      (new Date().getTime() - new Date(lastSeen).getTime()) > 300000 : true
    
    let colorClass = ''
    let displayText = status
    
    if (status === 'online' && isStale) {
      colorClass = 'bg-orange-100 text-orange-800'
      displayText = 'stale'
    } else {
      switch (status) {
        case 'online':
          colorClass = 'bg-green-100 text-green-800'
          break
        case 'offline':
          colorClass = 'bg-gray-100 text-gray-800'
          break
        case 'error':
          colorClass = 'bg-red-100 text-red-800'
          break
        case 'maintenance':
          colorClass = 'bg-blue-100 text-blue-800'
          break
        default:
          colorClass = 'bg-gray-100 text-gray-800'
      }
    }
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {displayText}
      </span>
    )
  }

  const getTypeIcon = (type: ScreenType) => {
    switch (type) {
      case 'menu_board':
        return '🍽️'
      case 'promo_board':
        return '📢'
      case 'employee_board':
        return '👥'
      case 'room_calendar':
        return '📅'
      default:
        return '📺'
    }
  }

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never'
    
    const now = new Date()
    const lastSeenDate = new Date(lastSeen)
    const diffMs = now.getTime() - lastSeenDate.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Screens</h1>
          <p className="text-gray-600">
            Manage digital display devices across all your locations
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setEnterCodeModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Enter Pairing Code
          </button>
          {!isTech && (
            <Link
              href="/dashboard/screens/add"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Screen
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200">
          {/* Search Bar */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Search screens by name, device ID, location, or district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | 'all')}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="error">Error</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as ScreenType | 'all')}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="menu_board">🍽️ Menu Board</option>
                <option value="promo_board">📢 Promo Board</option>
                <option value="employee_board">👥 Employee Board</option>
                <option value="room_calendar">📅 Room Calendar</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setStatusFilter('all')
                  setTypeFilter('all')
                  setSearchTerm('')
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Screens List */}
        <div className="divide-y divide-gray-200">
          {sortedLocationKeys.length === 0 ? (
            <div className="p-6 text-center">
              <Monitor className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? 'No screens found' : 'No screens yet'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your search terms or filters'
                  : 'Get started by adding your first screen'}
              </p>
            </div>
          ) : (
            sortedLocationKeys.map((locationName) => {
              const locationData = screensByLocation[locationName]
              return (
                <div key={locationName} className="p-6">
                  {/* Location Header */}
                  <div className="flex items-center mb-4">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {locationName}
                      </h3>
                      <div className="flex items-center text-sm text-gray-500">
                        {locationData.location.district && (
                          <>
                            <Building2 className="h-4 w-4 mr-1" />
                            <span className="mr-3">{locationData.location.district.name}</span>
                          </>
                        )}
                        <span>{locationData.screens.length} screen{locationData.screens.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Screens in this location */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ml-11">
                    {locationData.screens.map((screen) => {
                      const isPaired = !!(screen.device_id && screen.device_token)
                      const isLoading = actionLoading[screen.id]
                      
                      return (
                        <div
                          key={screen.id}
                          className={`rounded-lg p-4 transition-colors border-2 ${
                            isPaired 
                              ? 'bg-white border-green-200 hover:border-green-300' 
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 text-lg mr-3">
                                  {getTypeIcon(screen.screen_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-gray-900 truncate">
                                    {screen.name}
                                  </h4>
                                  <div className="flex items-center mt-1 space-x-2">
                                    {getStatusBadge(screen.device_status, screen.last_seen)}
                                    {isPaired && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <Smartphone className="h-3 w-3 mr-1" />
                                        Paired
                                      </span>
                                    )}
                                    {!isPaired && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Unpaired
                                      </span>
                                    )}
                                    {!screen.is_active && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        Inactive
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 space-y-2">
                                <div className="flex items-center text-xs text-gray-600">
                                  {getStatusIcon(screen.device_status, screen.last_seen)}
                                  <span className="ml-2 capitalize">{screen.screen_type.replace('_', ' ')}</span>
                                  <span className="mx-1">•</span>
                                  <span>{screen.resolution}</span>
                                  <span className="mx-1">•</span>
                                  <span className="capitalize">{screen.orientation}</span>
                                </div>
                                
                                {screen.device_id && (
                                  <div className="flex items-center text-xs text-gray-600">
                                    <Monitor className="h-3 w-3 mr-2 flex-shrink-0" />
                                    <span className="truncate">{screen.device_id}</span>
                                  </div>
                                )}
                                
                                <div className="flex items-center text-xs text-gray-600">
                                  <Clock className="h-3 w-3 mr-2 flex-shrink-0" />
                                  <span>Last seen: {formatLastSeen(screen.last_seen)}</span>
                                </div>
                                
                                {screen.last_sync_at && (
                                  <div className="flex items-center text-xs text-blue-600">
                                    <Activity className="h-3 w-3 mr-2 flex-shrink-0" />
                                    <span>Last sync: {formatLastSeen(screen.last_sync_at)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-center space-y-2 ml-2">
                              {/* Primary Action - View Button */}
                              <Link
                                href={`/dashboard/screens/${screen.id}`}
                                className="inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
                              >
                                <Monitor className="h-3 w-3 mr-1" />
                                View
                              </Link>
                              
                              {/* Secondary Actions */}
                              <div className="flex space-x-1">
                                <Link
                                  href={`/dashboard/screens/${screen.id}/edit`}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
                                >
                                  <Edit className="h-3 w-3" />
                                </Link>
                                
                                {/* Device Control Actions for Paired Devices */}
                                {isPaired && screen.device_status === 'online' && (
                                  <>
                                    <button
                                      onClick={() => handleDeviceAction(screen.id, 'restart')}
                                      disabled={isLoading === 'restart'}
                                      className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
                                      title="Restart device"
                                    >
                                      {isLoading === 'restart' ? (
                                        <Settings className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3 w-3" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {filteredScreens.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Screen Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Monitor className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Total Screens</p>
                  <p className="text-2xl font-bold text-blue-900">{filteredScreens.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Wifi className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Online</p>
                  <p className="text-2xl font-bold text-green-900">
                    {filteredScreens.filter(s => s.device_status === 'online').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <WifiOff className="h-6 w-6 text-gray-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Offline</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredScreens.filter(s => s.device_status === 'offline').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-600">Error</p>
                  <p className="text-2xl font-bold text-red-900">
                    {filteredScreens.filter(s => s.device_status === 'error').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full bg-yellow-600 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white"></div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-yellow-600">Inactive</p>
                  <p className="text-2xl font-bold text-yellow-900">
                    {filteredScreens.filter(s => !s.is_active).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enter Pairing Code Modal */}
      <EnterPairingCodeModal
        isOpen={enterCodeModalOpen}
        onClose={() => setEnterCodeModalOpen(false)}
        onSuccess={() => {
          fetchScreens()
          setToast({
            type: 'success',
            title: 'Device Paired Successfully!',
            message: 'Your Pi device has been connected to the selected screen.'
          })
        }}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}