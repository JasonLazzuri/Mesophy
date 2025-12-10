'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface CalendarInfo {
  id: string
  name: string
  owner?: {
    name?: string
    address?: string
  }
}

interface CalendarConnectModalProps {
  isOpen: boolean
  onClose: () => void
  currentFolderId: string | null
  onConnectComplete: () => void
}

type ModalStep = 'connecting' | 'selecting_calendar' | 'naming' | 'success' | 'error'

export default function CalendarConnectModal({
  isOpen,
  onClose,
  currentFolderId,
  onConnectComplete
}: CalendarConnectModalProps) {
  const [step, setStep] = useState<ModalStep>('connecting')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // OAuth state
  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null)

  // Calendar selection state
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('')

  // Media asset naming
  const [calendarName, setCalendarName] = useState('')

  // Configuration defaults
  const [timezone] = useState('America/Los_Angeles')
  const [showOrganizer] = useState(true)
  const [showAttendees] = useState(false)
  const [showPrivateDetails] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Check if we just returned from OAuth
      const params = new URLSearchParams(window.location.search)
      const connected = params.get('calendar_connected')

      if (connected === 'true') {
        // Just returned from OAuth - fetch session from DB
        setStep('selecting_calendar')
        fetchLatestSession()
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
      } else {
        // Not yet connected - redirect to OAuth
        initiateOAuth()
      }
    }
  }, [isOpen])

  const initiateOAuth = () => {
    setStep('connecting')
    setError(null)
    // Redirect to OAuth endpoint for media calendar connection
    // Use a unique session ID to identify this connection attempt
    const sessionId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    window.location.href = `/api/calendar/microsoft/auth/media?session_id=${sessionId}&return_url=${encodeURIComponent(window.location.pathname)}`
  }

  const fetchLatestSession = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch latest OAuth session from database (secure - no URL parameters)
      const response = await fetch('/api/calendar/oauth-session/latest')
      const result = await response.json()

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('OAuth session expired. Please try connecting again.')
        }
        throw new Error(result.error || 'Failed to fetch OAuth session')
      }

      // Store session ID and fetch calendars
      setOauthSessionId(result.session_id)
      await fetchCalendars(result.session_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch OAuth session')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const fetchCalendars = async (sessionId: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/calendar/media/calendars?session_id=${sessionId}`)
      const result = await response.json()

      if (!response.ok) {
        if (result.reconnect_required) {
          throw new Error('Session expired. Please reconnect to Microsoft.')
        }
        throw new Error(result.error || 'Failed to fetch calendars')
      }

      setCalendars(result.calendars || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendars')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const handleCalendarSelect = () => {
    if (!selectedCalendarId) {
      setError('Please select a calendar')
      return
    }

    // Auto-populate name from selected calendar
    const selectedCalendar = calendars.find(cal => cal.id === selectedCalendarId)
    if (selectedCalendar && !calendarName) {
      setCalendarName(selectedCalendar.name)
    }

    setStep('naming')
  }

  const handleCreateMediaAsset = async () => {
    if (!calendarName.trim()) {
      setError('Please enter a name for this calendar')
      return
    }

    if (!selectedCalendarId || !oauthSessionId) {
      setError('Missing calendar information')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const selectedCalendar = calendars.find(cal => cal.id === selectedCalendarId)

      const response = await fetch('/api/calendar/media/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: oauthSessionId,
          calendar_id: selectedCalendarId,
          calendar_name: selectedCalendar?.name || 'Unknown Calendar',
          media_asset_name: calendarName.trim(),
          folder_id: currentFolderId,
          timezone,
          show_organizer: showOrganizer,
          show_attendees: showAttendees,
          show_private_details: showPrivateDetails
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create calendar media asset')
      }

      setStep('success')
      setTimeout(() => {
        onConnectComplete()
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create calendar')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('connecting')
    setError(null)
    setLoading(false)
    setOauthSessionId(null)
    setSelectedCalendarId('')
    setCalendarName('')
    setCalendars([])
    onClose()
  }

  const handleRetry = () => {
    setError(null)
    initiateOAuth()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Connect Calendar
              </h2>
              <p className="text-sm text-gray-500">Microsoft Outlook Calendar Integration</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Connecting Step */}
          {step === 'connecting' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Redirecting to Microsoft...</h3>
              <p className="text-gray-600">You will be redirected to sign in with your Microsoft account</p>
            </div>
          )}

          {/* Calendar Selection Step */}
          {step === 'selecting_calendar' && (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-red-900">Error</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Select Calendar</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Choose which calendar to connect. This calendar will be available as a media asset that can be added to playlists.
                </p>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                    <span className="ml-2 text-sm text-gray-600">Loading calendars...</span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Calendar <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedCalendarId}
                      onChange={(e) => setSelectedCalendarId(e.target.value)}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      disabled={loading}
                    >
                      <option value="">Select a calendar...</option>
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.name}
                          {calendar.owner?.name && ` (${calendar.owner.name})`}
                        </option>
                      ))}
                    </select>
                    {calendars.length === 0 && (
                      <p className="mt-2 text-sm text-gray-500">
                        No calendars found. Make sure you have access to at least one calendar.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCalendarSelect}
                  disabled={loading || !selectedCalendarId}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Naming Step */}
          {step === 'naming' && (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-red-900">Error</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Name Your Calendar</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Give this calendar a descriptive name. This is how it will appear in your media library.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Media Asset Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={calendarName}
                    onChange={(e) => setCalendarName(e.target.value)}
                    placeholder="e.g., Conference Room A Calendar"
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    This name will help you identify the calendar when adding it to playlists
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => setStep('selecting_calendar')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  onClick={handleCreateMediaAsset}
                  disabled={loading || !calendarName.trim()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Create Calendar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Calendar Connected!
              </h3>
              <p className="text-gray-600 mb-6">
                Your Microsoft calendar has been added to your media library. You can now add it to playlists.
              </p>
              <div className="bg-green-50 rounded-lg p-4 text-left max-w-md mx-auto">
                <h4 className="font-medium text-green-900 mb-2">What's next?</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Calendar appears in your media library</li>
                  <li>• Add it to playlists like any other media</li>
                  <li>• Events sync automatically every 5-10 minutes</li>
                  <li>• Displays live meeting information on screens</li>
                </ul>
              </div>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connection Failed</h3>
              <p className="text-red-600 mb-6">{error}</p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
