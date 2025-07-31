'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, Clock, Monitor, Play, AlertTriangle, Save, Eye } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

interface Playlist {
  id: string
  name: string
  total_duration: number
  loop_mode: string
}

interface Screen {
  id: string
  name: string
  location_id: string
  location: {
    id: string
    name: string
    district_id: string
    district: {
      id: string
      name: string
    }
  } | null
}

interface Schedule {
  id: string
  organization_id: string
  name: string
  playlist_id: string
  screen_id: string | null
  start_date: string
  end_date: string | null
  start_time: string
  end_time: string
  days_of_week: number[]
  timezone: string
  priority: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  playlists: Playlist
  screens?: Screen
  screen_schedules?: {
    screen_id: string
    screens: Screen
  }[]
}

interface Conflict {
  screen_id: string | null
  screen: { name: string; id?: string }
  conflicting_schedules: {
    conflicting_schedule_id: string
    conflicting_schedule_name: string
    conflict_type: string
  }[]
}

interface RouteParams {
  params: {
    id: string
  }
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' }
]

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu'
]

export default function EditSchedulePage({ params }: RouteParams) {
  const { user } = useAuth()
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [name, setName] = useState('')
  const [playlistId, setPlaylistId] = useState('')
  const [screenAssignment, setScreenAssignment] = useState<'all' | 'single' | 'multiple'>('all')
  const [selectedScreenId, setSelectedScreenId] = useState('')
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [timezone, setTimezone] = useState('UTC')
  const [priority, setPriority] = useState(1)
  const [isActive, setIsActive] = useState(true)
  
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [screens, setScreens] = useState<Screen[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingSchedule, setFetchingSchedule] = useState(true)
  const [fetchingData, setFetchingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchSchedule()
    fetchData()
  }, [params.id])

  useEffect(() => {
    // Check for changes
    if (schedule) {
      const hasBasicChanges = 
        name !== schedule.name ||
        playlistId !== schedule.playlist_id ||
        startDate !== schedule.start_date ||
        endDate !== (schedule.end_date || '') ||
        startTime !== schedule.start_time ||
        endTime !== schedule.end_time ||
        timezone !== schedule.timezone ||
        priority !== schedule.priority ||
        isActive !== schedule.is_active ||
        JSON.stringify(selectedDays.sort()) !== JSON.stringify(schedule.days_of_week.sort())

      const hasScreenChanges = 
        (screenAssignment === 'single' && selectedScreenId !== (schedule.screen_id || '')) ||
        (screenAssignment === 'all' && schedule.screen_id !== null) ||
        (screenAssignment === 'multiple' && (
          schedule.screen_id !== null ||
          JSON.stringify(selectedScreenIds.sort()) !== JSON.stringify(
            (schedule.screen_schedules || []).map(ss => ss.screen_id).sort()
          )
        ))

      setHasChanges(hasBasicChanges || hasScreenChanges)
    }
  }, [name, playlistId, screenAssignment, selectedScreenId, selectedScreenIds, startDate, endDate, startTime, endTime, selectedDays, timezone, priority, isActive, schedule])

  useEffect(() => {
    // Check for conflicts when relevant fields change
    if (schedule && playlistId && startDate && startTime && endTime && selectedDays.length > 0) {
      const checkConflicts = async () => {
        await checkScheduleConflicts()
      }
      
      const timeoutId = setTimeout(checkConflicts, 500) // Debounce
      return () => clearTimeout(timeoutId)
    }
  }, [playlistId, screenAssignment, selectedScreenId, selectedScreenIds, startDate, endDate, startTime, endTime, selectedDays, priority, schedule])

  const fetchSchedule = async () => {
    try {
      setFetchingSchedule(true)
      const response = await fetch(`/api/schedules/${params.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch schedule')
      }
      const data = await response.json()
      const schedule = data.schedule
      
      setSchedule(schedule)
      setName(schedule.name)
      setPlaylistId(schedule.playlist_id)
      setStartDate(schedule.start_date)
      setEndDate(schedule.end_date || '')
      setStartTime(schedule.start_time)
      setEndTime(schedule.end_time)
      setSelectedDays(schedule.days_of_week)
      setTimezone(schedule.timezone)
      setPriority(schedule.priority)
      setIsActive(schedule.is_active)

      // Set screen assignment
      if (schedule.screen_id) {
        setScreenAssignment('single')
        setSelectedScreenId(schedule.screen_id)
      } else if (schedule.screen_schedules && schedule.screen_schedules.length > 0) {
        setScreenAssignment('multiple')
        setSelectedScreenIds(schedule.screen_schedules.map(ss => ss.screen_id))
      } else {
        setScreenAssignment('all')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setFetchingSchedule(false)
    }
  }

  const fetchData = async () => {
    try {
      setFetchingData(true)
      
      const [playlistsResponse, screensResponse] = await Promise.all([
        fetch('/api/playlists'),
        fetch('/api/screens')
      ])

      if (!playlistsResponse.ok || !screensResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const [playlistsData, screensData] = await Promise.all([
        playlistsResponse.json(),
        screensResponse.json()
      ])

      setPlaylists(playlistsData.playlists || [])
      setScreens(screensData.screens || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setFetchingData(false)
    }
  }

  const checkScheduleConflicts = async () => {
    try {
      setCheckingConflicts(true)
      
      const conflictData = {
        schedule_id: params.id,
        screen_id: screenAssignment === 'single' ? selectedScreenId : null,
        screen_ids: screenAssignment === 'multiple' ? selectedScreenIds : [],
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime,
        end_time: endTime,
        days_of_week: selectedDays,
        priority
      }

      const response = await fetch('/api/schedules/conflicts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(conflictData),
      })

      if (!response.ok) {
        throw new Error('Failed to check conflicts')
      }

      const data = await response.json()
      setConflicts(data.conflicts || [])
      setShowConflicts(data.has_conflicts)
    } catch (err) {
      console.error('Error checking conflicts:', err)
    } finally {
      setCheckingConflicts(false)
    }
  }

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    )
  }

  const toggleScreen = (screenId: string) => {
    setSelectedScreenIds(prev => 
      prev.includes(screenId)
        ? prev.filter(id => id !== screenId)
        : [...prev, screenId]
    )
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    if (minutes === 0) {
      return `${seconds}s`
    }
    return `${minutes}m ${seconds % 60}s`
  }

  const handleSave = async () => {
    if (!name.trim() || !playlistId || !startDate || !startTime || !endTime || selectedDays.length === 0) {
      setError('Please fill in all required fields')
      return
    }

    if (screenAssignment === 'single' && !selectedScreenId) {
      setError('Please select a screen')
      return
    }

    if (screenAssignment === 'multiple' && selectedScreenIds.length === 0) {
      setError('Please select at least one screen')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const scheduleData = {
        name: name.trim(),
        playlist_id: playlistId,
        screen_id: screenAssignment === 'single' ? selectedScreenId : null,
        screen_ids: screenAssignment === 'multiple' ? selectedScreenIds : [],
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime,
        end_time: endTime,
        days_of_week: selectedDays,
        timezone,
        priority,
        is_active: isActive
      }

      const response = await fetch(`/api/schedules/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update schedule')
      }

      const data = await response.json()
      setSchedule(data.schedule)
      setHasChanges(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getSelectedPlaylist = () => {
    return playlists.find(p => p.id === playlistId)
  }

  if (fetchingSchedule) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Calendar className="h-8 w-8 mr-3 text-indigo-600" />
            Edit Schedule
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/schedules"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Schedules
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Schedule not found
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/schedules"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Schedules
          </Link>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={loading || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Calendar className="h-8 w-8 mr-3 text-indigo-600" />
          Edit Schedule
        </h1>
        <p className="text-gray-600 mt-2">
          Modify your schedule settings and assignments
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {hasChanges && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
          You have unsaved changes. Click &quot;Save Changes&quot; to save them.
        </div>
      )}

      {/* Conflicts Warning */}
      {showConflicts && conflicts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">Schedule Conflicts Detected</h3>
              <div className="mt-2 text-sm text-yellow-700">
                {conflicts.map((conflict, index) => (
                  <div key={index} className="mb-2">
                    <p className="font-medium">{conflict.screen.name}:</p>
                    <ul className="ml-4 list-disc">
                      {conflict.conflicting_schedules.map((cs, csIndex) => (
                        <li key={csIndex}>
                          {cs.conflicting_schedule_name} 
                          <span className="text-xs">({cs.conflict_type} priority)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-yellow-600">
                Higher priority schedules will override lower priority ones. Adjust timing or priority to resolve conflicts.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Settings */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Name *
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter schedule name"
                  required
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="playlist" className="block text-sm font-medium text-gray-700 mb-1">
                  Playlist *
                </label>
                <select
                  id="playlist"
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select a playlist</option>
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name} ({formatDuration(playlist.total_duration)})
                    </option>
                  ))}
                </select>
                {getSelectedPlaylist() && (
                  <p className="text-sm text-gray-500 mt-1">
                    Duration: {formatDuration(getSelectedPlaylist()!.total_duration)} • 
                    Mode: {getSelectedPlaylist()!.loop_mode}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  id="endTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <input
                  type="number"
                  id="priority"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Higher numbers = higher priority</p>
              </div>

              <div className="col-span-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Days of Week *
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        selectedDays.includes(day.value)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Screen Assignment */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Screen Assignment</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assignment Type
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="screenAssignment"
                      value="all"
                      checked={screenAssignment === 'all'}
                      onChange={(e) => setScreenAssignment(e.target.value as 'all')}
                      className="mr-2"
                    />
                    <span className="text-sm">All Screens</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="screenAssignment"
                      value="single"
                      checked={screenAssignment === 'single'}
                      onChange={(e) => setScreenAssignment(e.target.value as 'single')}
                      className="mr-2"
                    />
                    <span className="text-sm">Single Screen</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="screenAssignment"
                      value="multiple"
                      checked={screenAssignment === 'multiple'}
                      onChange={(e) => setScreenAssignment(e.target.value as 'multiple')}
                      className="mr-2"
                    />
                    <span className="text-sm">Multiple Screens</span>
                  </label>
                </div>
              </div>

              {screenAssignment === 'single' && (
                <div>
                  <label htmlFor="screen" className="block text-sm font-medium text-gray-700 mb-1">
                    Select Screen
                  </label>
                  <select
                    id="screen"
                    value={selectedScreenId}
                    onChange={(e) => setSelectedScreenId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  >
                    <option value="">Choose a screen</option>
                    {screens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.name} - {screen.location?.name || 'Unknown Location'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {screenAssignment === 'multiple' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Screens ({selectedScreenIds.length} selected)
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md p-2">
                    {screens.map((screen) => (
                      <label key={screen.id} className="flex items-center p-2 hover:bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          checked={selectedScreenIds.includes(screen.id)}
                          onChange={() => toggleScreen(screen.id)}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {screen.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {screen.location?.name || 'Unknown Location'} • {screen.location?.district?.name || 'Unknown District'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {checkingConflicts && (
              <div className="mt-4 flex items-center text-sm text-gray-600">
                <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full mr-2"></div>
                Checking conflicts...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}