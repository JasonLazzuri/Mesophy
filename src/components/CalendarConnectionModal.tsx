'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Loader2, CheckCircle, AlertCircle, Settings, Clock, Mail, Eye, EyeOff } from 'lucide-react'

interface CalendarInfo {
  id: string
  name: string
  owner?: {
    name?: string
    address?: string
  }
}

interface CalendarConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  screenId: string
  existingConnection?: {
    calendar_id: string | null
    calendar_name: string | null
    timezone: string | null
    business_hours_start: string | null
    business_hours_end: string | null
    show_organizer: boolean
    show_attendees: boolean
    show_private_details: boolean
  } | null
  onSuccess: () => void
}

type ModalStep = 'connecting' | 'selecting_calendar' | 'configuring' | 'success' | 'error'

export default function CalendarConnectionModal({
  isOpen,
  onClose,
  screenId,
  existingConnection,
  onSuccess
}: CalendarConnectionModalProps) {
  const [step, setStep] = useState<ModalStep>('selecting_calendar')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calendar selection state
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(existingConnection?.calendar_id || '')

  // Configuration state
  const [timezone, setTimezone] = useState(existingConnection?.timezone || 'America/Los_Angeles')
  const [businessHoursStart, setBusinessHoursStart] = useState(existingConnection?.business_hours_start || '08:00:00')
  const [businessHoursEnd, setBusinessHoursEnd] = useState(existingConnection?.business_hours_end || '18:00:00')
  const [showOrganizer, setShowOrganizer] = useState(existingConnection?.show_organizer ?? true)
  const [showAttendees, setShowAttendees] = useState(existingConnection?.show_attendees ?? false)
  const [showPrivateDetails, setShowPrivateDetails] = useState(existingConnection?.show_private_details ?? false)

  useEffect(() => {
    if (isOpen) {
      if (existingConnection && existingConnection.calendar_id) {
        // Editing existing connection - go straight to configuration
        setStep('configuring')
        fetchCalendars() // Still fetch calendars for dropdown
      } else if (existingConnection && !existingConnection.calendar_id) {
        // OAuth completed but no calendar selected yet
        setStep('selecting_calendar')
        fetchCalendars()
      } else {
        // New connection - check if we just returned from OAuth
        const params = new URLSearchParams(window.location.search)
        if (params.get('calendar_connected') === 'true') {
          // Just returned from OAuth - fetch calendars
          setStep('selecting_calendar')
          fetchCalendars()
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname)
        } else {
          // Not yet connected - redirect to OAuth
          initiateOAuth()
        }
      }
    }
  }, [isOpen])

  const initiateOAuth = () => {
    setStep('connecting')
    // Redirect to OAuth endpoint
    window.location.href = `/api/calendar/microsoft/auth?screen_id=${screenId}`
  }

  const fetchCalendars = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/calendar/connections/${screenId}/calendars`)
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

  const handleCalendarSelect = async () => {
    if (!selectedCalendarId) {
      setError('Please select a calendar')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const selectedCalendar = calendars.find(cal => cal.id === selectedCalendarId)

      const response = await fetch(`/api/calendar/connections/${screenId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          calendar_id: selectedCalendarId,
          calendar_name: selectedCalendar?.name || 'Unknown Calendar'
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to select calendar')
      }

      // Move to configuration step
      setStep('configuring')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select calendar')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfiguration = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/calendar/connections/${screenId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timezone,
          business_hours_start: businessHoursStart,
          business_hours_end: businessHoursEnd,
          show_organizer: showOrganizer,
          show_attendees: showAttendees,
          show_private_details: showPrivateDetails
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save configuration')
      }

      setStep('success')
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('selecting_calendar')
    setError(null)
    setLoading(false)
    onClose()
  }

  const handleRetry = () => {
    setError(null)
    if (step === 'error') {
      initiateOAuth()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {existingConnection ? 'Calendar Settings' : 'Connect Calendar'}
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
              <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
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
                  Choose which calendar to display on this screen. This is typically a room or resource calendar.
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
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
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
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Next
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Configuration Step */}
          {step === 'configuring' && (
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
                <h3 className="text-lg font-medium text-gray-900 mb-4">Configure Display Settings</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Customize how calendar events are displayed on the screen.
                </p>

                <div className="space-y-6">
                  {/* Change Calendar */}
                  {calendars.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Calendar
                      </label>
                      <select
                        value={selectedCalendarId}
                        onChange={(e) => setSelectedCalendarId(e.target.value)}
                        className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={loading}
                      >
                        {calendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {calendar.name}
                            {calendar.owner?.name && ` (${calendar.owner.name})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Timezone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>

                  {/* Business Hours */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Business Hours
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={businessHoursStart}
                          onChange={(e) => setBusinessHoursStart(e.target.value + ':00')}
                          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End Time</label>
                        <input
                          type="time"
                          value={businessHoursEnd}
                          onChange={(e) => setBusinessHoursEnd(e.target.value + ':00')}
                          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Times displayed on the screen will be relative to these hours
                    </p>
                  </div>

                  {/* Privacy Settings */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Privacy Settings
                    </label>
                    <div className="space-y-3">
                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="show_organizer"
                          checked={showOrganizer}
                          onChange={(e) => setShowOrganizer(e.target.checked)}
                          className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="show_organizer" className="ml-3">
                          <span className="block text-sm text-gray-900">Show Meeting Organizer</span>
                          <span className="block text-xs text-gray-500">Display who scheduled the meeting</span>
                        </label>
                      </div>

                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="show_attendees"
                          checked={showAttendees}
                          onChange={(e) => setShowAttendees(e.target.checked)}
                          className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="show_attendees" className="ml-3">
                          <span className="block text-sm text-gray-900">Show Attendee List</span>
                          <span className="block text-xs text-gray-500">Display list of meeting attendees</span>
                        </label>
                      </div>

                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="show_private_details"
                          checked={showPrivateDetails}
                          onChange={(e) => setShowPrivateDetails(e.target.checked)}
                          className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="show_private_details" className="ml-3">
                          <span className="block text-sm text-gray-900">Show Private Meeting Details</span>
                          <span className="block text-xs text-gray-500">Show details of private/confidential meetings</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfiguration}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Save Settings
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
                {existingConnection ? 'Settings Updated!' : 'Calendar Connected!'}
              </h3>
              <p className="text-gray-600 mb-6">
                {existingConnection
                  ? 'Your calendar settings have been updated successfully.'
                  : 'Your Microsoft calendar has been connected successfully. Events will sync automatically.'}
              </p>
              <div className="bg-green-50 rounded-lg p-4 text-left max-w-md mx-auto">
                <h4 className="font-medium text-green-900 mb-2">What happens next?</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Calendar events sync every 5-10 minutes</li>
                  <li>• Room availability updates in real-time</li>
                  <li>• Meeting details display according to your privacy settings</li>
                  <li>• Countdown timers show time until next event</li>
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
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
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
