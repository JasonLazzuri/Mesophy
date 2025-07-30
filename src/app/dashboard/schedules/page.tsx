'use client'

import { Calendar, Clock, PlayCircle } from 'lucide-react'

export default function SchedulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Calendar className="h-8 w-8 mr-3 text-indigo-600" />
          Content Scheduling
        </h1>
        <p className="text-gray-600 mt-2">
          Schedule when different content appears on your digital displays
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <Clock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Scheduling System Coming Soon</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          This section will allow you to create sophisticated scheduling rules for when 
          different content appears on your screens throughout the day.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="p-4 bg-gray-50 rounded-lg">
            <Calendar className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Daily Schedules</h4>
            <p className="text-sm text-gray-600 mt-1">Set different content for different times</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <PlayCircle className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Playlist Management</h4>
            <p className="text-sm text-gray-600 mt-1">Create and manage content playlists</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <Clock className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Time-based Rules</h4>
            <p className="text-sm text-gray-600 mt-1">Breakfast, lunch, dinner content</p>
          </div>
        </div>
      </div>
    </div>
  )
}