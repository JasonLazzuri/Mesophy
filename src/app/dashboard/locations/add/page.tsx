'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, MapPin, Save, Building2, Map, Phone, Clock } from 'lucide-react'
import Link from 'next/link'

interface FormData {
  district_id: string
  name: string
  address: string
  phone: string
  timezone: string
}

interface FormErrors {
  district_id?: string
  name?: string
  address?: string
  phone?: string
  timezone?: string
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

export default function AddLocationPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingDistricts, setLoadingDistricts] = useState(true)
  const [errors, setErrors] = useState<FormErrors>({})
  const [districts, setDistricts] = useState<District[]>([])
  
  const [formData, setFormData] = useState<FormData>({
    district_id: '',
    name: '',
    address: '',
    phone: '',
    timezone: 'America/New_York',
  })

  // Fetch available districts
  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const response = await fetch('/api/districts')
        const result = await response.json()

        if (response.ok) {
          setDistricts(result.districts || [])
        } else {
          setErrors({ district_id: 'Failed to load districts' })
        }
      } catch (error) {
        console.error('Error fetching districts:', error)
        setErrors({ district_id: 'Failed to load districts' })
      } finally {
        setLoadingDistricts(false)
      }
    }

    fetchDistricts()
  }, [])

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

    if (!profile?.organization_id) {
      setErrors({ name: 'Organization not found. Please refresh and try again.' })
      return
    }

    setLoading(true)
    
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_id: formData.district_id,
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim() || null,
          timezone: formData.timezone,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error creating location:', result)
        setErrors({ 
          name: result.error || 'Failed to create location. Please try again.' 
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

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
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
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <MapPin className="h-8 w-8 mr-3 text-indigo-600" />
          Add New Location
        </h1>
        <p className="text-gray-600 mt-2">
          Create a new restaurant location within a district
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Location Information</h2>
          <p className="text-sm text-gray-600 mt-1">Fill in the details for the new location</p>
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
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Location
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Location Setup Tips</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Choose descriptive names that identify the specific location within the district</li>
          <li>• Include complete address information for accurate mapping and delivery</li>
          <li>• Select the correct timezone to ensure proper scheduling of content</li>
          <li>• Phone numbers help with support and communication with location staff</li>
          <li>• You can add digital signage screens to this location after creation</li>
        </ul>
      </div>
    </div>
  )
}