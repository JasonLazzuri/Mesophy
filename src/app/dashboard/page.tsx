'use client'

import { useAuth } from '@/hooks/useAuth'
import { Building2, Monitor, Users, Activity, TrendingUp, AlertCircle, CheckCircle2, MapPin } from 'lucide-react'

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
      name: 'Districts',
      value: stats.totalDistricts,
      icon: Building2,
      gradient: 'from-blue-600 to-indigo-700',
      change: '+12%',
      changeType: 'positive',
      subtitle: 'Regions managed',
    },
    {
      name: 'Locations',
      value: stats.totalLocations,
      icon: MapPin,
      gradient: 'from-emerald-600 to-teal-700',
      change: '+8%',
      changeType: 'positive',
      subtitle: 'Restaurant outlets',
    },
    {
      name: 'Total Screens',
      value: stats.totalScreens,
      icon: Monitor,
      gradient: 'from-purple-600 to-violet-700',
      change: '+25%',
      changeType: 'positive',
      subtitle: 'Digital displays',
    },
    {
      name: 'Online Screens',
      value: stats.onlineScreens,
      icon: Activity,
      gradient: 'from-red-500 to-rose-600',
      change: '-100%',
      changeType: 'negative',
      subtitle: 'Currently active',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Enhanced Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
          <div className="mt-2 flex flex-col space-y-1">
            <p className="text-lg text-gray-700">
              Welcome back, <span className="font-semibold text-gray-900">{profile?.full_name || profile?.email || 'User'}</span>
            </p>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                {profile?.role?.replace('_', ' ')?.toUpperCase() || 'Loading...'}
              </span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">Mesophy Restaurant Group</span>
            </div>
          </div>
        </div>
        <div className="mt-4 lg:mt-0">
          <div className="text-right">
            <p className="text-sm text-gray-500">Last updated</p>
            <p className="text-sm font-medium text-gray-900">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Debug section in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-amber-800 mb-2 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            Debug Information
          </h3>
          <div className="text-sm text-amber-700 space-y-1 grid grid-cols-2 gap-x-4">
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

      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="group relative bg-white rounded-xl shadow-sm border border-gray-200 p-6 transition-all duration-200 hover:shadow-lg hover:border-gray-300 hover:-translate-y-1 cursor-pointer"
          >
            {/* Gradient background overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 rounded-xl transition-opacity duration-200`} />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                  stat.changeType === 'positive' 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  <TrendingUp className={`h-3 w-3 ${stat.changeType === 'negative' ? 'rotate-180' : ''}`} />
                  <span>{stat.change}</span>
                </div>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.subtitle}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enhanced System Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Activity className="h-5 w-5 mr-2 text-gray-700" />
            System Status
          </h2>
          <p className="text-sm text-gray-600 mt-1">Real-time system health monitoring</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center space-x-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Database</p>
                <p className="text-sm text-emerald-700 font-medium">Connected</p>
                <p className="text-xs text-gray-600">Response time: 12ms</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Authentication</p>
                <p className="text-sm text-emerald-700 font-medium">Active</p>
                <p className="text-xs text-gray-600">Sessions: 24 active</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex-shrink-0">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Organization</p>
                <p className="text-sm text-blue-700 font-medium">Mesophy Restaurant Group</p>
                <p className="text-xs text-gray-600">Multi-region setup</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-gray-700" />
            Quick Actions
          </h2>
          <p className="text-sm text-gray-600 mt-1">Get started with common management tasks</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group relative p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 hover:border-blue-300 transition-all duration-200 hover:shadow-md cursor-pointer">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
              <Building2 className="h-10 w-10 text-blue-600 mb-4" />
              <p className="font-semibold text-gray-900 mb-2">Manage Districts</p>
              <p className="text-sm text-gray-600 leading-relaxed">View and organize your regional districts across different geographic areas</p>
            </div>
            <div className="group relative p-6 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-200 hover:border-purple-300 transition-all duration-200 hover:shadow-md cursor-pointer">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="h-2 w-2 bg-purple-500 rounded-full animate-pulse"></div>
              </div>
              <Monitor className="h-10 w-10 text-purple-600 mb-4" />
              <p className="font-semibold text-gray-900 mb-2">Setup Screens</p>
              <p className="text-sm text-gray-600 leading-relaxed">Configure and manage your digital displays across all restaurant locations</p>
            </div>
            <div className="group relative p-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 hover:border-emerald-300 transition-all duration-200 hover:shadow-md cursor-pointer">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <Users className="h-10 w-10 text-emerald-600 mb-4" />
              <p className="font-semibold text-gray-900 mb-2">Manage Content</p>
              <p className="text-sm text-gray-600 leading-relaxed">Upload media, create schedules, and manage content across your network</p>
            </div>
          </div>
          
          {/* Additional Action Bar */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-4 sm:mb-0">
                <p className="text-sm font-medium text-gray-900">Need help getting started?</p>
                <p className="text-sm text-gray-600">Check out our setup guide and documentation</p>
              </div>
              <div className="flex space-x-3">
                <button className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors duration-200">
                  View Documentation
                </button>
                <button className="inline-flex items-center px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200">
                  Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}