'use client'

import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { Building2, Monitor, Users, Activity } from 'lucide-react'
import { useEffect, useState } from 'react'

interface DashboardStats {
  totalOrganizations: number
  totalDistricts: number
  totalLocations: number
  totalScreens: number
  onlineScreens: number
  offlineScreens: number
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    totalOrganizations: 0,
    totalDistricts: 0,
    totalLocations: 0,
    totalScreens: 0,
    onlineScreens: 0,
    offlineScreens: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      try {
        const promises = []

        // Fetch districts count
        promises.push(
          supabase
            .from('districts')
            .select('id', { count: 'exact', head: true })
        )

        // Fetch locations count
        promises.push(
          supabase
            .from('locations')
            .select('id', { count: 'exact', head: true })
        )

        // Fetch screens count 
        promises.push(
          supabase
            .from('screens')
            .select('id', { count: 'exact', head: true })
        )

        const [districtsResult, locationsResult, screensResult] = await Promise.all(promises)

        setStats({
          totalOrganizations: 1, // For now, assuming single org
          totalDistricts: districtsResult.count || 0,
          totalLocations: locationsResult.count || 0,
          totalScreens: screensResult.count || 0,
          onlineScreens: 0, // Will be populated when screens exist
          offlineScreens: 0, // Will be populated when screens exist
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [supabase])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-600">
          Welcome back, {profile?.full_name || profile?.email}
        </p>
      </div>

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

      {/* Recent Activity Section */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          <div className="text-center text-gray-500 py-8">
            <Monitor className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2">No recent activity to display</p>
            <p className="text-sm">Activity will appear here as you manage your digital signage network</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {profile?.role === 'super_admin' && (
              <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                <Users className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                <p className="font-medium text-gray-900">Add New User</p>
                <p className="text-sm text-gray-500">Create a new user account</p>
              </button>
            )}
            <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
              <Monitor className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
              <p className="font-medium text-gray-900">Add Screen</p>
              <p className="text-sm text-gray-500">Register a new display device</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
              <Building2 className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
              <p className="font-medium text-gray-900">Upload Media</p>
              <p className="text-sm text-gray-500">Add new content to your library</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}