'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Building2, MapPin, Users, Monitor, ArrowLeft, Edit, Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface District {
  id: string
  name: string
  description: string | null
  manager_id: string | null
  created_at: string
  updated_at: string
  organization_id: string
  manager?: {
    full_name: string | null
    email: string
  } | null
}

interface Location {
  id: string
  name: string
  address: string | null
  phone: string | null
  manager_id: string | null
  timezone: string
  created_at: string
  manager?: {
    full_name: string | null
    email: string
  } | null
  _count?: {
    screens: number
  }
}

export default function DistrictDetailPage() {
  const params = useParams()
  const districtId = params.id as string
  
  const [district, setDistrict] = useState<District | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (districtId) {
      fetchDistrictDetails()
    }
  }, [districtId])

  const fetchDistrictDetails = async () => {
    try {
      // Fetch district details via API
      const response = await fetch(`/api/districts/${districtId}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch district')
      }
      
      const { district: districtData } = await response.json()
      setDistrict(districtData)

      // Fetch locations in this district (simplified to avoid relationship issues)
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('*')
        .eq('district_id', districtId)
        .order('name')

      if (locationsError) throw locationsError

      // Get screen counts for each location
      const locationsWithCounts = await Promise.all(
        (locationsData || []).map(async (location) => {
          const { count } = await supabase
            .from('screens')
            .select('*', { count: 'exact', head: true })
            .eq('location_id', location.id)

          return {
            ...location,
            _count: { screens: count || 0 }
          }
        })
      )

      setLocations(locationsWithCounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch district details')
      console.error('Error fetching district details:', err)
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

  if (error || !district) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Link
            href="/dashboard/districts"
            className="flex items-center text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Districts
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'District not found'}
        </div>
      </div>
    )
  }

  const totalScreens = locations.reduce((sum, location) => sum + (location._count?.screens || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/districts"
            className="flex items-center text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Districts
          </Link>
        </div>
        <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          <Edit className="h-4 w-4 mr-2" />
          Edit District
        </button>
      </div>

      {/* District Info */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-indigo-600" />
              </div>
            </div>
            <div className="ml-4">
              <h1 className="text-2xl font-bold text-gray-900">{district.name}</h1>
              {district.description && (
                <p className="text-gray-600">{district.description}</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">District Manager</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {district.manager
                  ? `${district.manager.full_name || district.manager.email}`
                  : 'No manager assigned'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Total Locations</dt>
              <dd className="mt-1 text-sm text-gray-900">{locations.length}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Total Screens</dt>
              <dd className="mt-1 text-sm text-gray-900">{totalScreens}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(district.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <MapPin className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Locations</dt>
                <dd className="text-3xl font-bold text-gray-900">{locations.length}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Monitor className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Screens</dt>
                <dd className="text-3xl font-bold text-gray-900">{totalScreens}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Managers</dt>
                <dd className="text-3xl font-bold text-gray-900">
                  {locations.filter(l => l.manager).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Locations List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Locations</h2>
          <button className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </button>
        </div>
        
        <div className="divide-y divide-gray-200">
          {locations.length === 0 ? (
            <div className="p-6 text-center">
              <MapPin className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No locations yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by adding your first location to this district
              </p>
            </div>
          ) : (
            locations.map((location) => (
              <div key={location.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                          <MapPin className="h-5 w-5 text-green-600" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <h3 className="text-sm font-medium text-gray-900">{location.name}</h3>
                        {location.address && (
                          <p className="text-sm text-gray-500">{location.address}</p>
                        )}
                        <div className="flex items-center mt-1 text-xs text-gray-500 space-x-4">
                          <span>
                            Manager: {location.manager
                              ? location.manager.full_name || location.manager.email
                              : 'Unassigned'}
                          </span>
                          <span>{location._count?.screens || 0} screens</span>
                          <span>Timezone: {location.timezone}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/dashboard/locations/${location.id}`}
                      className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}