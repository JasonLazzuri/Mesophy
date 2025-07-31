'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Monitor, Play, Clock, Calendar, AlertCircle, Eye, Settings } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

interface MediaAsset {
  id: string
  name: string
  file_url: string
  mime_type: string
  duration: number | null
}

interface PlaylistItem {
  id: string
  media_asset_id: string
  order_index: number
  duration_override: number | null
  transition_type: string
  media_assets: MediaAsset
}

interface Playlist {
  id: string
  name: string
  total_duration: number
  loop_mode: string
  playlist_items: PlaylistItem[]
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
  created_at: string
  playlists: Playlist
}

interface Screen {
  id: string
  name: string
  screen_type: string
  device_status: string
  location_id: string
  last_heartbeat: string | null
  locations: {
    id: string
    name: string
    district_id: string
    districts: {
      id: string
      name: string
    }
  }
}

interface ActiveSchedule {
  schedule_id: string
  schedule_name: string
  playlist_id: string
  playlist_name: string
  priority: number
}

interface RouteParams {
  params: {
    id: string
  }
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ScreenContentPage({ params }: RouteParams) {
  const { user } = useAuth()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [activeSchedules, setActiveSchedules] = useState<ActiveSchedule[]>([])
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchScreenContent()
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchScreenContent, 30000)
    setRefreshInterval(interval)
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [params.id])

  const fetchScreenContent = async () => {
    try {
      setLoading(true)
      
      // Fetch screen info and schedules
      const [screenResponse, schedulesResponse] = await Promise.all([
        fetch(`/api/screens/${params.id}`),
        fetch(`/api/schedules/screen/${params.id}?active_only=true`)
      ])

      if (!screenResponse.ok || !schedulesResponse.ok) {
        throw new Error('Failed to fetch screen data')
      }

      const [screenData, schedulesData] = await Promise.all([
        screenResponse.json(),
        schedulesResponse.json()
      ])

      setScreen(screenData.screen)
      setSchedules(schedulesData.schedules || [])

      // Get active schedules for current time
      const now = new Date().toISOString()
      const activeResponse = await fetch(`/api/schedules/screen/${params.id}?datetime=${now}`)
      
      if (activeResponse.ok) {
        const activeData = await activeResponse.json()
        setActiveSchedules(activeData.active_schedules || [])
        
        // Set current playlist from highest priority active schedule
        if (activeData.active_schedules && activeData.active_schedules.length > 0) {
          const topSchedule = activeData.active_schedules[0]
          const schedule = schedulesData.schedules?.find((s: Schedule) => s.id === topSchedule.schedule_id)
          if (schedule) {
            setCurrentPlaylist(schedule.playlists)
          }
        } else {
          setCurrentPlaylist(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes === 0) {
      return `${remainingSeconds}s`
    }
    return `${minutes}m ${remainingSeconds}s`
  }

  const getDaysDisplay = (daysOfWeek: number[]) => {
    if (daysOfWeek.length === 7) {
      return 'Every day'
    }
    if (daysOfWeek.length === 5 && !daysOfWeek.includes(0) && !daysOfWeek.includes(6)) {
      return 'Weekdays'
    }
    if (daysOfWeek.length === 2 && daysOfWeek.includes(0) && daysOfWeek.includes(6)) {
      return 'Weekends'
    }
    return daysOfWeek.map(day => DAYS_OF_WEEK[day]).join(', ')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'offline': return 'bg-red-500'
      case 'error': return 'bg-red-500'
      case 'maintenance': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online'
      case 'offline': return 'Offline'
      case 'error': return 'Error'
      case 'maintenance': return 'Maintenance'
      default: return 'Unknown'
    }
  }

  const isScheduleCurrentlyActive = (schedule: Schedule) => {
    const now = new Date()
    const currentDate = now.toISOString().split('T')[0]
    const currentTime = now.toTimeString().split(' ')[0].slice(0, 5)
    const currentDay = now.getDay()

    return schedule.is_active &&
           schedule.start_date <= currentDate &&
           (!schedule.end_date || schedule.end_date >= currentDate) &&
           schedule.start_time <= currentTime &&
           schedule.end_time > currentTime &&
           schedule.days_of_week.includes(currentDay)
  }

  if (loading && !screen) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Monitor className="h-8 w-8 mr-3 text-indigo-600" />
            Screen Content
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!screen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Screen not found
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/screens/${params.id}/edit`}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Monitor className="h-8 w-8 mr-3 text-indigo-600" />
          Screen Content
        </h1>
        <p className="text-gray-600 mt-2">
          View current and scheduled content for {screen.name}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Screen Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{screen.name}</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">Location:</span> {screen.locations.name}</p>
              <p><span className="font-medium">District:</span> {screen.locations.districts.name}</p>
              <p><span className="font-medium">Type:</span> {screen.screen_type.replace('_', ' ')}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center justify-end mb-2">
              <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(screen.device_status)}`} />
              <span className="text-sm font-medium text-gray-900">
                {getStatusText(screen.device_status)}
              </span>
            </div>
            {screen.last_heartbeat && (
              <p className="text-xs text-gray-500">
                Last seen: {new Date(screen.last_heartbeat).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Play className="h-5 w-5 mr-2 text-green-600" />
            Currently Playing
          </h2>
          
          {currentPlaylist ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">{currentPlaylist.name}</h3>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-4 w-4 mr-1" />
                  {formatDuration(currentPlaylist.total_duration)}
                </div>
              </div>
              
              <div className="space-y-2 mb-4">
                {activeSchedules.map((activeSchedule, index) => (
                  <div key={index} className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
                    <span className="font-medium">{activeSchedule.schedule_name}</span>
                    <span className="text-green-600 ml-2">Priority: {activeSchedule.priority}</span>
                  </div>
                ))}
              </div>

              {/* Playlist Items */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Playlist Items ({currentPlaylist.playlist_items?.length || 0})
                </h4>
                <div className="max-h-48 overflow-y-auto">
                  {currentPlaylist.playlist_items?.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500 font-mono w-6">{index + 1}</div>
                      <div className="w-12 h-8 bg-gray-200 rounded overflow-hidden">
                        {item.media_assets.mime_type.startsWith('image/') ? (
                          <img
                            src={item.media_assets.file_url}
                            alt={item.media_assets.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                            <Play className="h-3 w-3 text-gray-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 truncate">{item.media_assets.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatDuration(item.duration_override || item.media_assets.duration || 10)}
                        </p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-gray-500 italic">No items in playlist</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-900 mb-2">No Active Content</h3>
              <p className="text-sm text-gray-600">
                No schedules are currently active for this screen.
              </p>
            </div>
          )}
        </div>

        {/* All Schedules */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-indigo-600" />
            All Schedules
          </h2>
          
          {schedules.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {schedules.map((schedule) => {
                const isActive = isScheduleCurrentlyActive(schedule)
                return (
                  <div
                    key={schedule.id}
                    className={`p-3 rounded-lg border ${
                      isActive 
                        ? 'bg-green-50 border-green-200' 
                        : schedule.is_active
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-900">
                        {schedule.name}
                      </h4>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          Priority: {schedule.priority}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Playlist: {schedule.playlists.name}</span>
                        <span>{formatDuration(schedule.playlists.total_duration)}</span>
                      </div>
                      <div>
                        Time: {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                      </div>
                      <div>
                        Days: {getDaysDisplay(schedule.days_of_week)}
                      </div>
                      <div>
                        Period: {formatDate(schedule.start_date)}
                        {schedule.end_date && ` - ${formatDate(schedule.end_date)}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-900 mb-2">No Schedules</h3>
              <p className="text-sm text-gray-600 mb-4">
                This screen doesn't have any scheduled content yet.
              </p>
              <Link
                href="/dashboard/schedules/add"
                className="inline-flex items-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Create Schedule
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}