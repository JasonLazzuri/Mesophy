'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, MapPin, Save, Building2, Map, Phone, Clock, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface FormData {
  district_id: string
  name: string
  address: string
  phone: string
  timezone: string
  is_active: boolean
}

interface FormErrors {
  district_id?: string
  name?: string
  address?: string
  phone?: string
  timezone?: string
}

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
  district?: {
    id: string
    name: string
  } | null
}

interface District {
  id: string
  name: string
}

// Common timezone options
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona Time (MST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKST)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' }
]

export default function EditLocationPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  useAuth() // For authentication context
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [loadingDistricts, setLoadingDistricts] = useState(true)
  const [errors, setErrors] = useState<FormErrors>({})
  const [location, setLocation] = useState<Location | null>(null)
  const [districts, setDistricts] = useState<District[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const [formData, setFormData] = useState<FormData>({
    district_id: '',
    name: '',
    address: '',
    phone: '',
    timezone: 'America/New_York',
    is_active: true,
  })

  // Fetch location data and districts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const resolvedParams = await params
        
        // Fetch location and districts in parallel
        const [locationResponse, districtsResponse] = await Promise.all([
          fetch(`/api/locations/${resolvedParams.id}`),
          fetch('/api/districts')
        ])

        const locationResult = await locationResponse.json()
        const districtsResult = await districtsResponse.json()

        if (!locationResponse.ok) {
          router.push('/dashboard/locations')
          return
        }

        if (districtsResponse.ok) {
          setDistricts(districtsResult.districts || [])
        }
        
        const locationData = locationResult.location
        setLocation(locationData)
        setFormData({
          district_id: locationData.district_id,
          name: locationData.name,
          address: locationData.address || '',
          phone: locationData.phone || '',
          timezone: locationData.timezone,
          is_active: locationData.is_active,
        })
      } catch (error) {
        console.error('Error fetching data:', error)
        router.push('/dashboard/locations')
      } finally {
        setLoadingLocation(false)
        setLoadingDistricts(false)
      }
    }

    fetchData()
  }, [params, router])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // District validation
    if (!formData.district_id) {
      newErrors.district_id = 'Please select a district'
    }

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Location name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Location name must be at least 2 characters'
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Location name must be less than 100 characters'
    }

    // Address validation
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required'
    } else if (formData.address.trim().length < 5) {
      newErrors.address = 'Address must be at least 5 characters'
    } else if (formData.address.trim().length > 500) {
      newErrors.address = 'Address must be less than 500 characters'
    }

    // Phone validation (optional)
    if (formData.phone.trim() && (formData.phone.trim().length < 10 || formData.phone.trim().length > 20)) {
      newErrors.phone = 'Phone number must be between 10 and 20 characters'
    }

    // Timezone validation
    if (!formData.timezone) {
      newErrors.timezone = 'Please select a timezone'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    
    try {
      const resolvedParams = await params
      const response = await fetch(`/api/locations/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_id: formData.district_id,
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim() || null,
          timezone: formData.timezone,
          is_active: formData.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error updating location:', result)
        setErrors({ 
          name: result.error || 'Failed to update location. Please try again.' 
        })
        return
      }

      // Success - redirect to locations list
      router.push('/dashboard/locations')
      
    } catch (error) {
      console.error('Unexpected error:', error)
      setErrors({ name: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    
    try {
      const resolvedParams = await params
      console.log('Attempting to delete location:', resolvedParams.id)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(`/api/locations/${resolvedParams.id}`, {
        method: 'DELETE',
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      console.log('Delete response status:', response.status)

      if (!response.ok) {
        const result = await response.json()
        console.error('Error deleting location:', result)
        setErrors({ 
          name: result.error || 'Failed to delete location. Please try again.' 
        })
        return
      }

      const result = await response.json()
      console.log('Delete successful:', result)

      // Success - redirect to locations list
      router.push('/dashboard/locations')
      
    } catch (error) {
      console.error('Unexpected error during delete:', error)
      if (error instanceof Error && error.name === 'AbortError') {
        setErrors({ name: 'Request timed out. Please try again.' })
      } else {
        setErrors({ name: 'An unexpected error occurred. Please try again.' })
      }
    } finally {
      setLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear errors when user starts typing
    if (typeof value === 'string' && errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (loadingLocation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!location) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Location not found</p>
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
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Locations
          </Link>
        </div>
        
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-lg text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Location
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <MapPin className="h-8 w-8 mr-3 text-indigo-600" />
          Edit Location
        </h1>
        <p className="text-gray-600 mt-2">
          Update the location information and settings
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Location Information</h2>
          <p className="text-sm text-gray-600 mt-1">Update the details for this location</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* District Selection */}
          <div>
            <label htmlFor="district_id" className="block text-sm font-medium text-gray-700 mb-2">
              District *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Building2 className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="district_id"
                value={formData.district_id}
                onChange={(e) => handleInputChange('district_id', e.target.value)}
                disabled={loadingDistricts}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.district_id ? 'border-red-300' : 'border-gray-300'
                } ${loadingDistricts ? 'bg-gray-100' : 'bg-white'}`}
              >
                <option value="">
                  {loadingDistricts ? 'Loading districts...' : 'Select a district'}
                </option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </div>
            {errors.district_id && (
              <p className="mt-2 text-sm text-red-600">{errors.district_id}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Choose the district this location belongs to
            </p>
          </div>

          {/* Location Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Location Name *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., Downtown Restaurant, Mall Location"
                maxLength={100}
              />
            </div>
            {errors.name && (
              <p className="mt-2 text-sm text-red-600">{errors.name}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.name.length}/100 characters
            </p>
          </div>

          {/* Address */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
              Address *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 pt-3 pointer-events-none">
                <Map className="h-5 w-5 text-gray-400" />
              </div>
              <textarea
                id="address"
                rows={3}
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.address ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Full street address including city, state, and zip code..."
                maxLength={500}
              />
            </div>
            {errors.address && (
              <p className="mt-2 text-sm text-red-600">{errors.address}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.address.length}/500 characters
            </p>
          </div>

          {/* Phone Number */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.phone ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="(555) 123-4567"
                maxLength={20}
              />
            </div>
            {errors.phone && (
              <p className="mt-2 text-sm text-red-600">{errors.phone}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Optional - Location contact number
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
              Timezone *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Clock className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.timezone ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            {errors.timezone && (
              <p className="mt-2 text-sm text-red-600">{errors.timezone}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Choose the local timezone for this location
            </p>
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => handleInputChange('is_active', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">Location is active</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Inactive locations will not display content on their screens
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <Link
              href="/dashboard/locations"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </Link>
            
            <button
              type="submit"
              disabled={loading || loadingDistricts}
              className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Updating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Update Location
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-2">Delete Location</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete &quot;{location.name}&quot;? This action cannot be undone and will affect all screens at this location.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-24 mr-2 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                >
                  {loading ? '...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-24 hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}