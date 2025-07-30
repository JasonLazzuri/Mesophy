'use client'

import { useEffect, useState } from 'react'
import { MapPin, Search, Plus, Edit, Building2, Clock, Phone, Map } from 'lucide-react'
import Link from 'next/link'

interface Location {
  id: string
  district_id: string
  name: string
  address: string
  phone: string | null
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined data
  district?: {
    id: string
    name: string
  } | null
}

interface LocationsByDistrict {
  [districtName: string]: {
    district: {
      id: string
      name: string
    }
    locations: Location[]
  }
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLocations()
  }, [])

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/locations')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch locations')
      }

      setLocations(result.locations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch locations')
      console.error('Error fetching locations:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter locations based on search term
  const filteredLocations = locations.filter(location =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.district?.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group locations by district
  const locationsByDistrict: LocationsByDistrict = filteredLocations.reduce((acc, location) => {
    const districtName = location.district?.name || 'Unknown District'
    
    if (!acc[districtName]) {
      acc[districtName] = {
        district: location.district || { id: '', name: districtName },
        locations: []
      }
    }
    
    acc[districtName].locations.push(location)
    return acc
  }, {} as LocationsByDistrict)

  // Sort districts alphabetically
  const sortedDistricts = Object.keys(locationsByDistrict).sort()

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
            Manage your restaurant locations and their settings
          </p>
        </div>
        <Link
          href="/dashboard/locations/add"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Link>
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
              placeholder="Search locations by name, address, or district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Locations List */}
        <div className="divide-y divide-gray-200">
          {sortedDistricts.length === 0 ? (
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
            sortedDistricts.map((districtName) => {
              const districtData = locationsByDistrict[districtName]
              return (
                <div key={districtName} className="p-6">
                  {/* District Header */}
                  <div className="flex items-center mb-4">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {districtName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {districtData.locations.length} location{districtData.locations.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Locations in this district */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ml-11">
                    {districtData.locations.map((location) => (
                      <div
                        key={location.id}
                        className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center">
                              <div className="flex-shrink-0">
                                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                                  <MapPin className="h-4 w-4 text-green-600" />
                                </div>
                              </div>
                              <div className="ml-3 flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-900 truncate">
                                  {location.name}
                                </h4>
                                <div className="flex items-center mt-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      location.is_active
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {location.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              <div className="flex items-center text-sm text-gray-600">
                                <Map className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span className="truncate">{location.address}</span>
                              </div>
                              
                              {location.phone && (
                                <div className="flex items-center text-sm text-gray-600">
                                  <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                                  <span>{location.phone}</span>
                                </div>
                              )}
                              
                              <div className="flex items-center text-sm text-gray-600">
                                <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span>{location.timezone.replace('_', ' ')}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 ml-2">
                            <Link
                              href={`/dashboard/locations/${location.id}/edit`}
                              className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
                            >
                              <Edit className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {filteredLocations.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Location Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Total Districts</p>
                  <p className="text-2xl font-bold text-blue-900">{sortedDistricts.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Total Locations</p>
                  <p className="text-2xl font-bold text-green-900">{filteredLocations.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full bg-emerald-600 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white"></div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-emerald-600">Active Locations</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {filteredLocations.filter(l => l.is_active).length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full bg-red-600 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white"></div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-600">Inactive Locations</p>
                  <p className="text-2xl font-bold text-red-900">
                    {filteredLocations.filter(l => !l.is_active).length}
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