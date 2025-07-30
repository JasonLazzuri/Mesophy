'use client'

import { Monitor } from 'lucide-react'

export default function ScreensPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Monitor className="h-8 w-8 mr-3 text-indigo-600" />
          Screens Management
        </h1>
        <p className="text-gray-600 mt-2">
          Manage digital displays across all your restaurant locations
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <Monitor className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Screens Management Coming Soon</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          This section will allow you to manage all digital screens across your restaurant locations, 
          including menu boards, promotional displays, and employee information screens.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900">Screen Status</h4>
            <p className="text-sm text-gray-600 mt-1">Monitor online/offline status</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900">Content Assignment</h4>
            <p className="text-sm text-gray-600 mt-1">Assign playlists to screens</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900">Device Management</h4>
            <p className="text-sm text-gray-600 mt-1">Configure Raspberry Pi devices</p>
          </div>
        </div>
      </div>
    </div>
  )
}