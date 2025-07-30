'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { MapPin, Building2, Monitor, Phone, Clock, ArrowLeft, Users } from 'lucide-react'
import Link from 'next/link'

interface LocationDetail {
  id: string
  name: string
  address: string | null
  phone: string | null
  timezone: string
  district_id: string
  manager_id: string | null
  created_at: string
  updated_at: string
  district?: {
    name: string
    id: string
  } | null
  manager?: {
    full_name: string | null
    email: string
  } | null
  screens?: Array<{
    id: string
    name: string
    screen_type: string
    device_status: string
    is_active: boolean
  }>
}

export default function LocationDetailPage() {
  const params = useParams()
  const locationId = params.id as string
  const [location, setLocation] = useState<LocationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (locationId) {
      fetchLocation()
    }
  }, [locationId])

  const fetchLocation = async () => {
    if (!supabase || !locationId) {
      setError('Database connection unavailable or invalid location ID')
      setLoading(false)
      return
    }

    try {
      // Fetch location with district and manager info
      const { data: locationData, error: locationError } = await supabase
        .from('locations')
        .select(`
          *,
          districts (
            id,
            name
          ),
          user_profiles!locations_manager_id_fkey (
            full_name,
            email
          )
        `)
        .eq('id', locationId)
        .single()

      if (locationError) throw locationError

      // Fetch screens for this location
      const { data: screensData, error: screensError } = await supabase
        .from('screens')
        .select('id, name, screen_type, device_status, is_active')
        .eq('location_id', locationId)
        .order('name')

      if (screensError) throw screensError

      setLocation({
        ...locationData,
        district: locationData.districts,
        manager: locationData.user_profiles,
        screens: screensData || []
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch location details')
      console.error('Error fetching location:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error || !location) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Link
            href="/dashboard/locations"
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Locations
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'Location not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/locations"
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Locations
          </Link>
        </div>
      </div>

      {/* Location Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <MapPin className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="ml-4">
              <h1 className="text-2xl font-bold text-gray-900">{location.name}</h1>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <div className="flex items-center">
                  <Building2 className="h-4 w-4 mr-1" />
                  {location.district?.name || 'No district assigned'}
                </div>
                <div className="flex items-center">
                  <Monitor className="h-4 w-4 mr-1" />
                  {location.screens?.length || 0} screens
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Location Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Location Details</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <p className="mt-1 text-sm text-gray-900">
                  {location.address || 'No address provided'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <p className="mt-1 text-sm text-gray-900">
                  {location.phone || 'No phone number provided'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Timezone</label>
                <p className="mt-1 text-sm text-gray-900">{location.timezone}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Manager</label>
                <p className="mt-1 text-sm text-gray-900">
                  {location.manager
                    ? `${location.manager.full_name || location.manager.email}`
                    : 'No manager assigned'}
                </p>
              </div>
            </div>
          </div>

          {/* Screens */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Digital Screens</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {location.screens && location.screens.length > 0 ? (
                location.screens.map((screen) => (
                  <div key={screen.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <Monitor className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{screen.name}</p>
                          <p className="text-sm text-gray-500">
                            {screen.screen_type.replace('_', ' ').toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            screen.device_status === 'online'
                              ? 'bg-green-100 text-green-800'
                              : screen.device_status === 'offline'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {screen.device_status}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            screen.is_active
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {screen.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center">
                  <Monitor className="mx-auto h-12 w-12 text-gray-300" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No screens configured</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Get started by adding digital screens to this location.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Quick Stats</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Screens</span>
                <span className="text-sm font-medium text-gray-900">
                  {location.screens?.length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Online Screens</span>
                <span className="text-sm font-medium text-green-600">
                  {location.screens?.filter(s => s.device_status === 'online').length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Active Screens</span>
                <span className="text-sm font-medium text-blue-600">
                  {location.screens?.filter(s => s.is_active).length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <button className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <Monitor className="h-4 w-4 mr-2" />
                Add Screen
              </button>
              <Link
                href={`/dashboard/locations/${location.id}/edit`}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Edit Location
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}