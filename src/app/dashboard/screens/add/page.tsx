'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, ArrowLeft, Building2, MapPin } from 'lucide-react'
import Link from 'next/link'
import { ScreenType, Orientation } from '@/types/database'

interface Location {
  id: string
  name: string
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

export default function AddScreenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [formData, setFormData] = useState({
    location_id: '',
    name: '',
    screen_type: 'menu_board' as ScreenType,
    device_id: '',
    resolution: '1920x1080',
    orientation: 'landscape' as Orientation
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

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
      setLocationsLoading(false)
    }
  }

  // Group locations by district for the dropdown
  const locationsByDistrict: LocationsByDistrict = locations.reduce((acc, location) => {
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

  const sortedDistrictNames = Object.keys(locationsByDistrict).sort()

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!formData.location_id) {
      errors.location_id = 'Location is required'
    }

    if (!formData.name.trim()) {
      errors.name = 'Screen name is required'
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Screen name must be at least 2 characters'
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Screen name must be less than 100 characters'
    }

    if (!formData.screen_type) {
      errors.screen_type = 'Screen type is required'
    }

    // Validate resolution format
    const resolutionPattern = /^\d{3,4}x\d{3,4}$/
    if (!resolutionPattern.test(formData.resolution)) {
      errors.resolution = 'Resolution must be in format like 1920x1080'
    }

    // Validate device_id if provided
    if (formData.device_id && formData.device_id.trim().length < 3) {
      errors.device_id = 'Device ID must be at least 3 characters if provided'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const submitData = {
        ...formData,
        name: formData.name.trim(),
        device_id: formData.device_id.trim() || null
      }

      const response = await fetch('/api/screens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create screen')
      }

      setSuccessMessage('Screen created successfully!')
      
      // Redirect after a short delay
      setTimeout(() => {
        router.push('/dashboard/screens')
      }, 1500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create screen')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  if (locationsLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Monitor className="h-7 w-7 mr-3 text-indigo-600" />
          Add New Screen
        </h1>
        <p className="text-gray-600 mt-1">
          Configure a new digital display device for a location
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {successMessage}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Screen Configuration</h2>
          <p className="text-sm text-gray-600 mt-1">
            Enter the details for the new screen device
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Location Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location <span className="text-red-500">*</span>
            </label>
            <select
              id="location_id"
              name="location_id"
              value={formData.location_id}
              onChange={handleInputChange}
              className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                validationErrors.location_id ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              required
            >
              <option value="">Select a location...</option>
              {sortedDistrictNames.map((districtName) => (
                <optgroup key={districtName} label={districtName}>
                  {locationsByDistrict[districtName].locations
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {validationErrors.location_id && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                {validationErrors.location_id}
              </p>
            )}
          </div>

          {/* Screen Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Screen Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Front Counter Display, Kitchen Menu Board"
              className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                validationErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              required
            />
            {validationErrors.name && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              Give this screen a descriptive name to identify its purpose and location
            </p>
          </div>

          {/* Screen Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Screen Type <span className="text-red-500">*</span>
            </label>
            <select
              id="screen_type"
              name="screen_type"
              value={formData.screen_type}
              onChange={handleInputChange}
              className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                validationErrors.screen_type ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              required
            >
              <option value="menu_board">🍽️ Menu Board</option>
              <option value="promo_board">📢 Promo Board</option>
              <option value="employee_board">👥 Employee Board</option>
            </select>
            {validationErrors.screen_type && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.screen_type}</p>
            )}
          </div>

          {/* Display Settings Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Resolution */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution <span className="text-red-500">*</span>
              </label>
              <select
                id="resolution"
                name="resolution"
                value={formData.resolution}
                onChange={handleInputChange}
                className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                  validationErrors.resolution ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                required
              >
                <option value="1920x1080">1920x1080 (Full HD)</option>
                <option value="1366x768">1366x768 (HD)</option>
                <option value="1280x720">1280x720 (HD 720p)</option>
                <option value="3840x2160">3840x2160 (4K UHD)</option>
                <option value="2560x1440">2560x1440 (QHD)</option>
                <option value="1024x768">1024x768 (XGA)</option>
              </select>
              {validationErrors.resolution && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.resolution}</p>
              )}
            </div>

            {/* Orientation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Orientation <span className="text-red-500">*</span>
              </label>
              <select
                id="orientation"
                name="orientation"
                value={formData.orientation}
                onChange={handleInputChange}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="landscape">Landscape (Horizontal)</option>
                <option value="portrait">Portrait (Vertical)</option>
              </select>
            </div>
          </div>

          {/* Device Information */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-base font-medium text-gray-900 mb-4">Device Information</h3>
            <div className="space-y-6">
              {/* Device ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device ID
                </label>
                <input
                  type="text"
                  id="device_id"
                  name="device_id"
                  value={formData.device_id}
                  onChange={handleInputChange}
                  placeholder="e.g., RPI-MAIN-001, unique hardware identifier"
                  className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                    validationErrors.device_id ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {validationErrors.device_id && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.device_id}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  Unique identifier for the physical device (optional but recommended)
                </p>
              </div>

            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between rounded-b-lg">
          <div className="text-sm text-gray-600">
            <span className="text-red-500">*</span> Required fields
          </div>
          <div className="space-x-3">
            <Link
              href="/dashboard/screens"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Creating Screen...
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4 mr-2" />
                  Create Screen
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}