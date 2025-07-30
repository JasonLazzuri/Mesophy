'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MapPin, Search, Plus, Edit, Building2, Monitor } from 'lucide-react'
import Link from 'next/link'

interface Location {
  id: string
  name: string
  address: string | null
  phone: string | null
  timezone: string
  district_id: string
  manager_id: string | null
  created_at: string
  updated_at: string
  // Joined data
  district?: {
    name: string
  } | null
  manager?: {
    full_name: string | null
    email: string
  } | null
  _count?: {
    screens: number
  }
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchLocations()
  }, [])

  const fetchLocations = async () => {
    if (!supabase) {
      setError('Database connection unavailable')
      setLoading(false)
      return
    }

    try {
      // First, get locations with district and manager info
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select(`
          *,
          districts (
            name
          ),
          user_profiles!locations_manager_id_fkey (
            full_name,
            email
          )
        `)
        .order('name')

      if (locationsError) throw locationsError

      // Then get screen counts for each location
      const locationsWithCounts = await Promise.all(
        (locationsData || []).map(async (location) => {
          const { count } = await supabase
            .from('screens')
            .select('*', { count: 'exact', head: true })
            .eq('location_id', location.id)

          return {
            ...location,
            district: location.districts,
            manager: location.user_profiles,
            _count: { screens: count || 0 }
          }
        })
      )

      setLocations(locationsWithCounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch locations')
      console.error('Error fetching locations:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredLocations = locations.filter(location =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.district?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-gray-600">
            Manage your store locations and their digital signage setups
          </p>
        </div>
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Locations List */}
        <div className="divide-y divide-gray-200">
          {filteredLocations.length === 0 ? (
            <div className="p-6 text-center">
              <MapPin className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm ? 'No locations found' : 'No locations yet'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Get started by creating your first location'}
              </p>
            </div>
          ) : (
            filteredLocations.map((location) => (
              <div key={location.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                          <MapPin className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium text-gray-900">
                            {location.name}
                          </h3>
                          <div className="ml-2 flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center">
                              <Monitor className="h-4 w-4 mr-1" />
                              {location._count?.screens || 0} screens
                            </div>
                          </div>
                        </div>
                        {location.address && (
                          <p className="text-sm text-gray-600 mt-1">
                            {location.address}
                          </p>
                        )}
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Building2 className="h-4 w-4 mr-1" />
                            <span>
                              District: {location.district?.name || 'Unassigned'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span>
                              Manager: {location.manager
                                ? `${location.manager.full_name || location.manager.email}`
                                : 'No manager assigned'}
                            </span>
                          </div>
                        </div>
                        {location.phone && (
                          <p className="text-sm text-gray-500 mt-1">
                            Phone: {location.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/dashboard/locations/${location.id}`}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      View Details
                    </Link>
                    <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {filteredLocations.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Location Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Total Locations</p>
                  <p className="text-2xl font-bold text-green-900">{filteredLocations.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Monitor className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Total Screens</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {filteredLocations.reduce((sum, l) => sum + (l._count?.screens || 0), 0)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-purple-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-purple-600">Districts Covered</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {new Set(filteredLocations.map(l => l.district?.name).filter(Boolean)).size}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}