'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  Monitor, ArrowLeft, Edit, Wifi, WifiOff, AlertTriangle, Settings,
  Clock, Activity, HardDrive, Cpu, MemoryStick, Thermometer,
  Calendar, MapPin, Building2, Power, RefreshCw, Eye
} from 'lucide-react'
import Link from 'next/link'
import { ScreenType, DeviceStatus, Orientation, LogLevel } from '@/types/database'
import CalendarConnectionCard from '@/components/CalendarConnectionCard'
import CalendarConnectionModal from '@/components/CalendarConnectionModal'

interface Screen {
  id: string
  location_id: string
  name: string
  screen_type: ScreenType
  device_id: string | null
  device_status: DeviceStatus
  resolution: string
  orientation: Orientation
  is_active: boolean
  last_heartbeat: string | null
  ip_address: string | null
  firmware_version: string | null
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

interface DeviceLog {
  id: string
  screen_id: string
  log_level: LogLevel
  message: string
  metadata: any
  created_at: string
}

export default function ScreenDetailPage() {
  const params = useParams()
  const screenId = params.id as string

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [recentLogs, setRecentLogs] = useState<DeviceLog[]>([])
  const [error, setError] = useState('')
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [calendarConnection, setCalendarConnection] = useState<any>(null)

  useEffect(() => {
    if (screenId) {
      fetchScreenDetails()

      // Check if we just returned from Microsoft OAuth callback
      const params = new URLSearchParams(window.location.search)
      if (params.get('calendar_connected') === 'true') {
        // Fetch calendar connection and open modal
        fetchCalendarConnection().then(() => {
          setShowCalendarModal(true)
        })
      } else if (screen?.screen_type === 'room_calendar') {
        // Fetch calendar connection for room calendar screens
        fetchCalendarConnection()
      }
    }
  }, [screenId, screen?.screen_type])

  const fetchScreenDetails = async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true)
      }

      const response = await fetch(`/api/screens/${screenId}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch screen details')
      }

      setScreen(result.screen)
      setRecentLogs(result.recent_logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch screen details')
      console.error('Error fetching screen details:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchCalendarConnection = async () => {
    try {
      const response = await fetch(`/api/calendar/connections/${screenId}`)
      const result = await response.json()

      if (response.ok && result.connected && result.connection) {
        setCalendarConnection(result.connection)
      } else {
        setCalendarConnection(null)
      }
    } catch (err) {
      console.error('Error fetching calendar connection:', err)
      setCalendarConnection(null)
    }
  }

  const getStatusIcon = (status: DeviceStatus, lastHeartbeat: string | null) => {
    const isStale = lastHeartbeat ? 
      (new Date().getTime() - new Date(lastHeartbeat).getTime()) > 300000 : true // 5 minutes
    
    switch (status) {
      case 'online':
        return isStale ? 
          <WifiOff className="h-5 w-5 text-orange-500" /> : 
          <Wifi className="h-5 w-5 text-green-500" />
      case 'offline':
        return <WifiOff className="h-5 w-5 text-gray-400" />
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />
      case 'maintenance':
        return <Settings className="h-5 w-5 text-blue-500" />
      default:
        return <WifiOff className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: DeviceStatus, lastHeartbeat: string | null) => {
    const isStale = lastHeartbeat ? 
      (new Date().getTime() - new Date(lastHeartbeat).getTime()) > 300000 : true
    
    if (status === 'online' && isStale) {
      return 'text-orange-600 bg-orange-50 border-orange-200'
    }
    
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50 border-green-200'
      case 'offline': return 'text-gray-600 bg-gray-50 border-gray-200'
      case 'error': return 'text-red-600 bg-red-50 border-red-200'
      case 'maintenance': return 'text-blue-600 bg-blue-50 border-blue-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getTypeIcon = (type: ScreenType) => {
    switch (type) {
      case 'menu_board': return '🍽️'
      case 'promo_board': return '📢'
      case 'employee_board': return '👥'
      case 'room_calendar': return '📅'
      default: return '📺'
    }
  }

  const formatLastSeen = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return 'Never'
    
    const now = new Date()
    const lastSeen = new Date(lastHeartbeat)
    const diffMs = now.getTime() - lastSeen.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getLogLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50'
      case 'warning': return 'text-yellow-600 bg-yellow-50'
      case 'info': return 'text-blue-600 bg-blue-50'
      case 'debug': return 'text-purple-600 bg-purple-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!screen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'Screen not found or you don\'t have permission to access it.'}
        </div>
      </div>
    )
  }

  const uptime = screen.last_heartbeat ? 
    new Date().getTime() - new Date(screen.last_heartbeat).getTime() : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchScreenDetails(true)}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href={`/dashboard/screens/${screenId}/edit`}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit Screen
          </Link>
        </div>
      </div>

      {/* Screen Overview */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="text-2xl mr-3">{getTypeIcon(screen.screen_type)}</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{screen.name}</h1>
                <div className="flex items-center mt-1 space-x-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>{screen.location?.name}</span>
                  </div>
                  {screen.location?.district && (
                    <>
                      <span>•</span>
                      <div className="flex items-center">
                        <Building2 className="h-4 w-4 mr-1" />
                        <span>{screen.location.district.name}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-lg border ${getStatusColor(screen.device_status, screen.last_heartbeat)}`}>
              <div className="flex items-center space-x-2">
                {getStatusIcon(screen.device_status, screen.last_heartbeat)}
                <span className="font-medium capitalize">
                  {screen.device_status === 'online' && screen.last_heartbeat && 
                   (new Date().getTime() - new Date(screen.last_heartbeat).getTime()) > 300000
                    ? 'Stale' : screen.device_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <Monitor className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-900">Screen Type</span>
              </div>
              <p className="mt-1 text-lg font-semibold text-gray-900 capitalize">
                {screen.screen_type.replace('_', ' ')}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <Eye className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-900">Resolution</span>
              </div>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {screen.resolution} ({screen.orientation})
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-900">Last Seen</span>
              </div>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatLastSeen(screen.last_heartbeat)}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <Power className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-900">Status</span>
              </div>
              <p className={`mt-1 text-lg font-semibold ${screen.is_active ? 'text-green-900' : 'text-red-900'}`}>
                {screen.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Device Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Device Information</h2>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Hardware Details</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Device ID</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {screen.device_id || 'Not configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Firmware Version</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {screen.firmware_version || 'Unknown'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">IP Address</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {screen.ip_address || 'Not available'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Timestamps</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Created</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatDateTime(screen.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Last Updated</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatDateTime(screen.updated_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Last Heartbeat</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {screen.last_heartbeat ? formatDateTime(screen.last_heartbeat) : 'Never'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Health Metrics</h2>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${
                screen.device_status === 'online' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <Activity className={`h-6 w-6 ${
                  screen.device_status === 'online' ? 'text-green-600' : 'text-red-600'
                }`} />
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Connection</h3>
              <p className="text-sm text-gray-500 mt-1">
                {screen.device_status === 'online' ? 'Device is responding' : 'Device not responding'}
              </p>
            </div>

            <div className="text-center">
              <div className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${
                screen.last_heartbeat && (new Date().getTime() - new Date(screen.last_heartbeat).getTime()) < 300000
                  ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                <Clock className={`h-6 w-6 ${
                  screen.last_heartbeat && (new Date().getTime() - new Date(screen.last_heartbeat).getTime()) < 300000
                    ? 'text-green-600' : 'text-yellow-600'
                }`} />
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Heartbeat</h3>
              <p className="text-sm text-gray-500 mt-1">
                {screen.last_heartbeat ? 
                  (new Date().getTime() - new Date(screen.last_heartbeat).getTime()) < 300000 ?
                    'Recent' : 'Stale'
                  : 'Never received'
                }
              </p>
            </div>

            <div className="text-center">
              <div className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${
                screen.is_active ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <Power className={`h-6 w-6 ${
                  screen.is_active ? 'text-green-600' : 'text-gray-600'
                }`} />
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Display</h3>
              <p className="text-sm text-gray-500 mt-1">
                {screen.is_active ? 'Content displaying' : 'Display inactive'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Logs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          <p className="text-sm text-gray-600 mt-1">Latest device logs and events</p>
        </div>
        <div className="divide-y divide-gray-200">
          {recentLogs.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h3>
              <p className="mt-1 text-sm text-gray-500">
                Device logs will appear here when the screen becomes active
              </p>
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="px-6 py-4">
                <div className="flex items-start space-x-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getLogLevelColor(log.log_level)}`}>
                    {log.log_level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{log.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDateTime(log.created_at)}
                    </p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
                          View details
                        </summary>
                        <pre className="mt-1 text-xs bg-gray-50 p-2 rounded border overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Calendar Integration - Only for room_calendar screens */}
      {screen.screen_type === 'room_calendar' && (
        <>
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Calendar Integration</h2>
              <p className="text-sm text-gray-600 mt-1">
                Connect Microsoft Outlook calendar to display room availability
              </p>
            </div>
            <CalendarConnectionCard
              screenId={screen.id}
              onConnect={() => setShowCalendarModal(true)}
              onUpdate={() => fetchScreenDetails()}
            />
          </div>

          <CalendarConnectionModal
            isOpen={showCalendarModal}
            onClose={() => setShowCalendarModal(false)}
            screenId={screen.id}
            existingConnection={calendarConnection}
            onSuccess={() => {
              fetchScreenDetails()
              fetchCalendarConnection()
            }}
          />
        </>
      )}

      {/* Content Assignment Placeholder */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Content Assignment</h2>
          <p className="text-sm text-gray-600 mt-1">Manage what content displays on this screen</p>
        </div>
        <div className="px-6 py-8 text-center">
          <Monitor className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Content management coming soon</h3>
          <p className="mt-1 text-sm text-gray-500">
            You'll be able to assign playlists and schedules to this screen
          </p>
        </div>
      </div>
    </div>
  )
}