'use client'

import { useAuth } from '@/hooks/useAuth'
import { Building2, Monitor, Users, Activity } from 'lucide-react'

export default function DashboardPage() {
  const { profile, loading } = useAuth()

  // Debug log current user profile
  console.log('Dashboard page - User profile:', profile)

  // Simple static stats for testing
  const stats = {
    totalOrganizations: 1,
    totalDistricts: 3,
    totalLocations: 5,
    totalScreens: 7,
    onlineScreens: 0,
    offlineScreens: 7,
  }

  const statCards = [
    {
      name: 'Total Districts',
      value: stats.totalDistricts,
      icon: Building2,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Locations',
      value: stats.totalLocations,
      icon: Building2,
      color: 'bg-green-500',
    },
    {
      name: 'Total Screens',
      value: stats.totalScreens,
      icon: Monitor,
      color: 'bg-purple-500',
    },
    {
      name: 'Online Screens',
      value: stats.onlineScreens,
      icon: Activity,
      color: 'bg-emerald-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-600">
          Welcome back, {profile?.full_name || profile?.email || 'User'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Role: {profile?.role?.replace('_', ' ')?.toUpperCase() || 'Loading...'}
        </p>
      </div>

      {/* Debug section in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Debug Information</h3>
          <div className="text-sm text-yellow-700 space-y-1">
            <div><strong>Loading:</strong> {loading.toString()}</div>
            <div><strong>Profile:</strong> {profile ? 'Loaded' : 'Not loaded'}</div>
            <div><strong>User ID:</strong> {profile?.id || 'None'}</div>
            <div><strong>Email:</strong> {profile?.email || 'None'}</div>
            <div><strong>Role:</strong> {profile?.role || 'None'}</div>
            <div><strong>Organization ID:</strong> {profile?.organization_id || 'None'}</div>
            <div><strong>Full Name:</strong> {profile?.full_name || 'None'}</div>
            <div><strong>Is Active:</strong> {profile?.is_active?.toString() || 'None'}</div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-lg shadow p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-full ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">System Status</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Database Connection</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Authentication Service</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Organization</span>
              <span className="text-gray-900">Mesophy Restaurant Group</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Next Steps</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <Building2 className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
              <p className="font-medium text-gray-900 text-center">Manage Districts</p>
              <p className="text-sm text-gray-500 text-center">View and organize your regional districts</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <Monitor className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
              <p className="font-medium text-gray-900 text-center">Setup Screens</p>
              <p className="text-sm text-gray-500 text-center">Configure your digital displays</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <Users className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
              <p className="font-medium text-gray-900 text-center">Add Content</p>
              <p className="text-sm text-gray-500 text-center">Upload media and create schedules</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}