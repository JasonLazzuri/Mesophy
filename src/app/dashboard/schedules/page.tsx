'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, Plus, Edit, Trash2, Monitor, Play, Search, Filter, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
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

interface Schedule {
  id: string
  organization_id: string
  name: string
  playlist_id: string
  screen_id: string | null
  target_screen_types: string[] | null
  target_locations: string[] | null
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

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SchedulesPage() {
  const { user } = useAuth()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/schedules?include_screens=true')
      if (!response.ok) {
        throw new Error('Failed to fetch schedules')
      }
      const data = await response.json()
      setSchedules(data.schedules || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      setDeleting(true)
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete schedule')
      }
      
      setSchedules(prev => prev.filter(s => s.id !== scheduleId))
      setShowDeleteModal(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule')
    } finally {
      setDeleting(false)
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

  const getScreensDisplay = (schedule: Schedule) => {
    if (schedule.screen_id && schedule.screens) {
      return schedule.screens.name
    }
    if (schedule.screen_schedules && schedule.screen_schedules.length > 0) {
      if (schedule.screen_schedules.length === 1) {
        return schedule.screen_schedules[0].screens.name
      }
      return `${schedule.screen_schedules.length} screens`
    }
    // Check if target_screen_types is set
    if (schedule.target_screen_types && schedule.target_screen_types.length > 0) {
      const screenTypeNames = schedule.target_screen_types.map(type => {
        // Convert screen type to display name
        switch(type) {
          case 'employee_board': return 'Employee boards'
          case 'menu_board': return 'Menu Board'
          case 'reception_display': return 'Reception Display'
          default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }
      })
      return screenTypeNames.join(', ')
    }
    // Check if target_locations is set
    if (schedule.target_locations && schedule.target_locations.length > 0) {
      return `${schedule.target_locations.length} location${schedule.target_locations.length > 1 ? 's' : ''}`
    }
    return 'All screens'
  }

  const isScheduleActive = (schedule: Schedule) => {
    if (!schedule.is_active) return false
    
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const currentDay = now.getDay()
    
    // Check if current date is within schedule range
    if (schedule.start_date > today) return false
    if (schedule.end_date && schedule.end_date < today) return false
    
    // Check if today is in days_of_week
    if (!schedule.days_of_week.includes(currentDay)) return false
    
    return true
  }

  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = schedule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         schedule.playlists.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && schedule.is_active) ||
                         (filterStatus === 'inactive' && !schedule.is_active)
    
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Calendar className="h-8 w-8 mr-3 text-indigo-600" />
            Schedules
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Calendar className="h-8 w-8 mr-3 text-indigo-600" />
            Schedules
          </h1>
          <p className="text-gray-600 mt-2">
            Schedule when playlists appear on your digital displays
          </p>
        </div>
        <Link
          href="/dashboard/schedules/add"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search schedules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">All Schedules</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {filteredSchedules.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchTerm || filterStatus !== 'all' ? 'No schedules found' : 'No schedules yet'}
          </h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            {searchTerm || filterStatus !== 'all'
              ? 'Try adjusting your search terms or filters to find what you\'re looking for.'
              : 'Create your first schedule to automate content playback on your screens.'
            }
          </p>
          {!searchTerm && filterStatus === 'all' && (
            <Link
              href="/dashboard/schedules/add"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Schedule
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Playlist
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Screen(s)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time & Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {schedule.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(schedule.start_date)}
                          {schedule.end_date && ` - ${formatDate(schedule.end_date)}`}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Play className="h-4 w-4 text-indigo-600 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {schedule.playlists.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatDuration(schedule.playlists.total_duration)} • {schedule.playlists.loop_mode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Monitor className="h-4 w-4 text-gray-400 mr-2" />
                        <div className="text-sm text-gray-900">
                          {getScreensDisplay(schedule)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {getDaysDisplay(schedule.days_of_week)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-2 ${
                          isScheduleActive(schedule) ? 'bg-green-500' : 
                          schedule.is_active ? 'bg-yellow-500' : 'bg-gray-400'
                        }`} />
                        <span className={`text-sm ${
                          isScheduleActive(schedule) ? 'text-green-700' : 
                          schedule.is_active ? 'text-yellow-700' : 'text-gray-500'
                        }`}>
                          {isScheduleActive(schedule) ? 'Running' : 
                           schedule.is_active ? 'Scheduled' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {schedule.priority > 1 && (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" />
                        )}
                        <span className="text-sm text-gray-900">
                          {schedule.priority}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          href={`/dashboard/schedules/${schedule.id}/edit`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setShowDeleteModal(schedule.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Schedule</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this schedule? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSchedule(showDeleteModal)}
                disabled={deleting}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}