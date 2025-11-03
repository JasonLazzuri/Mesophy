'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, XCircle, Settings, Trash2, RefreshCw, AlertCircle, Clock, Mail } from 'lucide-react'

interface CalendarConnection {
  id: string
  provider: string
  calendar_id: string | null
  calendar_name: string | null
  microsoft_email: string | null
  is_active: boolean
  sync_status: string
  last_sync_at: string | null
  last_sync_error: string | null
  timezone: string | null
  business_hours_start: string | null
  business_hours_end: string | null
}

interface CalendarConnectionCardProps {
  screenId: string
  onConnect: () => void
  onUpdate: () => void
}

export default function CalendarConnectionCard({
  screenId,
  onConnect,
  onUpdate
}: CalendarConnectionCardProps) {
  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<CalendarConnection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    fetchConnection()
  }, [screenId])

  const fetchConnection = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/calendar/connections/${screenId}`)
      const result = await response.json()

      if (!response.ok && response.status !== 404) {
        throw new Error(result.error || 'Failed to fetch calendar connection')
      }

      if (result.connected && result.connection) {
        setConnection(result.connection)
      } else {
        setConnection(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch connection')
      console.error('Error fetching calendar connection:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setIsDeleting(true)
      setError(null)

      const response = await fetch(`/api/calendar/connections/${screenId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to disconnect calendar')
      }

      setConnection(null)
      setShowDeleteConfirm(false)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
      console.error('Error disconnecting calendar:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatTime = (time: string | null) => {
    if (!time) return 'Not set'
    // Convert 24h format to 12h format
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never'

    const now = new Date()
    const syncTime = new Date(lastSync)
    const diffMs = now.getTime() - syncTime.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50'
      case 'error': return 'text-red-600 bg-red-50'
      case 'pending': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-600">Loading calendar connection...</span>
      </div>
    )
  }

  if (error && !connection) {
    return (
      <div className="px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-900">Failed to load connection</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={fetchConnection}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Not connected state
  if (!connection) {
    return (
      <div className="px-6 py-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
          <Calendar className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No Calendar Connected</h3>
        <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
          Connect a Microsoft Outlook calendar to display room availability, meeting schedules, and countdown timers.
        </p>
        <div className="mt-6">
          <button
            onClick={onConnect}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Connect Microsoft Calendar
          </button>
        </div>
        <div className="mt-6 bg-blue-50 rounded-lg p-4 text-left max-w-2xl mx-auto">
          <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Click "Connect Microsoft Calendar" to authorize access</li>
            <li>2. Select which calendar to display (e.g., "Conference Room A")</li>
            <li>3. Configure business hours and display preferences</li>
            <li>4. Calendar events sync automatically every 5-10 minutes</li>
          </ol>
        </div>
      </div>
    )
  }

  // Connected state
  return (
    <div className="px-6 py-6">
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-900">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4 flex-1">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-medium text-green-900 flex items-center">
                Calendar Connected
                <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSyncStatusColor(connection.sync_status)}`}>
                  {connection.sync_status}
                </span>
              </h3>

              {/* Calendar Info */}
              <div className="mt-3 space-y-2">
                {connection.calendar_name && (
                  <div className="flex items-center text-sm text-green-800">
                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="font-medium">Calendar:</span>
                    <span className="ml-2">{connection.calendar_name}</span>
                  </div>
                )}

                {connection.microsoft_email && (
                  <div className="flex items-center text-sm text-green-800">
                    <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="font-medium">Microsoft Account:</span>
                    <span className="ml-2">{connection.microsoft_email}</span>
                  </div>
                )}

                <div className="flex items-center text-sm text-green-800">
                  <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="font-medium">Business Hours:</span>
                  <span className="ml-2">
                    {formatTime(connection.business_hours_start)} - {formatTime(connection.business_hours_end)}
                  </span>
                </div>

                <div className="flex items-center text-sm text-green-800">
                  <RefreshCw className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="font-medium">Last Synced:</span>
                  <span className="ml-2">{formatLastSync(connection.last_sync_at)}</span>
                </div>

                {connection.timezone && (
                  <div className="flex items-center text-sm text-green-800">
                    <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="font-medium">Timezone:</span>
                    <span className="ml-2">{connection.timezone}</span>
                  </div>
                )}
              </div>

              {/* Sync Error */}
              {connection.last_sync_error && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-xs font-medium text-red-900">Last Sync Error:</p>
                  <p className="text-xs text-red-700 mt-1">{connection.last_sync_error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={onConnect}
                  className="inline-flex items-center px-3 py-1.5 border border-green-300 text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                >
                  <Settings className="h-4 w-4 mr-1.5" />
                  Settings
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="ml-3 text-lg font-medium text-gray-900">Disconnect Calendar</h3>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to disconnect this calendar? You will need to reconnect and reconfigure the calendar connection if you want to use it again.
            </p>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDeleting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
