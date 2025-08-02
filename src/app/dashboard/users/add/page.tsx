'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { 
  ArrowLeft, 
  UserPlus, 
  Save, 
  Mail, 
  User,
  Crown,
  Building2,
  MapPin,
  Shield,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface District {
  id: string
  name: string
}

interface Location {
  id: string
  name: string
  district_id: string
}

interface FormData {
  email: string
  full_name: string
  role: 'super_admin' | 'district_manager' | 'location_manager' | ''
  district_id: string
  location_id: string
  send_invitation: boolean
}

interface FormErrors {
  email?: string
  full_name?: string
  role?: string
  district_id?: string
  location_id?: string
  general?: string
}

const roleConfig = {
  super_admin: {
    label: 'Super Admin',
    color: 'bg-purple-100 text-purple-800',
    icon: Crown,
    description: 'Full system access across all organizations'
  },
  district_manager: {
    label: 'District Manager',
    color: 'bg-blue-100 text-blue-800',
    icon: Building2,
    description: 'Manages locations within assigned districts'
  },
  location_manager: {
    label: 'Location Manager',
    color: 'bg-green-100 text-green-800',
    icon: MapPin,
    description: 'Manages screens at assigned locations'
  }
}

export default function AddUserPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [districts, setDistricts] = useState<District[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingDistricts, setLoadingDistricts] = useState(true)
  const [loadingLocations, setLoadingLocations] = useState(false)
  
  const [formData, setFormData] = useState<FormData>({
    email: '',
    full_name: '',
    role: '',
    district_id: '',
    location_id: '',
    send_invitation: true,
  })

  // Check permissions
  const canCreateUsers = profile?.role === 'super_admin' || profile?.role === 'district_manager'
  
  useEffect(() => {
    console.log('Add User Page - useEffect triggered', { 
      authLoading, 
      profile, 
      canCreateUsers,
      profileRole: profile?.role 
    })
    
    // Don't check permissions until auth is loaded
    if (authLoading) {
      console.log('Add User Page - Auth still loading, waiting...')
      return
    }
    
    // If auth is loaded but no profile, redirect to login
    if (!profile) {
      console.log('Add User Page - No profile found, redirecting to users')
      router.push('/dashboard/users')
      return
    }
    
    // Check permissions only after auth is loaded
    if (!canCreateUsers) {
      console.log('Add User Page - No permission to create users, redirecting', { 
        profileRole: profile?.role,
        canCreateUsers 
      })
      router.push('/dashboard/users')
      return
    }
    
    console.log('Add User Page - Permission granted, fetching districts')
    fetchDistricts()
  }, [authLoading, profile, canCreateUsers, router])

  const fetchDistricts = async () => {
    try {
      const response = await fetch('/api/districts')
      const data = await response.json()
      
      if (response.ok) {
        setDistricts(data.districts || [])
      } else {
        console.error('Error fetching districts:', data.error)
      }
    } catch (error) {
      console.error('Error fetching districts:', error)
    } finally {
      setLoadingDistricts(false)
    }
  }

  const fetchLocations = async (districtId: string) => {
    if (!districtId) {
      setLocations([])
      return
    }

    setLoadingLocations(true)
    try {
      const response = await fetch(`/api/locations?district_id=${districtId}`)
      const data = await response.json()
      
      if (response.ok) {
        setLocations(data.locations || [])
      } else {
        console.error('Error fetching locations:', data.error)
        setLocations([])
      }
    } catch (error) {
      console.error('Error fetching locations:', error)
      setLocations([])
    } finally {
      setLoadingLocations(false)
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Please enter a valid email address'
      }
    }

    // Full name validation
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    } else if (formData.full_name.trim().length < 2) {
      newErrors.full_name = 'Full name must be at least 2 characters'
    }

    // Role validation
    if (!formData.role) {
      newErrors.role = 'Please select a role'
    }

    // Role-specific validations
    if (formData.role) {
      // District managers can only create location managers
      if (profile?.role === 'district_manager' && formData.role !== 'location_manager') {
        newErrors.role = 'You can only create Location Manager accounts'
      }

      // District assignment validation
      if (formData.role === 'district_manager' || formData.role === 'location_manager') {
        if (!formData.district_id) {
          newErrors.district_id = 'District selection is required for this role'
        }
      }

      // Location assignment validation for location managers
      if (formData.role === 'location_manager') {
        if (!formData.location_id) {
          newErrors.location_id = 'Location selection is required for Location Managers'
        }
      }

      // District managers can only assign to their own district
      if (profile?.role === 'district_manager' && formData.district_id !== profile.district_id) {
        newErrors.district_id = 'You can only assign users to your own district'
      }
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
      const requestData = {
        email: formData.email.trim(),
        full_name: formData.full_name.trim(),
        role: formData.role,
        district_id: formData.district_id || null,
        location_id: formData.location_id || null,
        send_invitation: formData.send_invitation,
      }

      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error creating user:', result)
        setErrors({ 
          general: result.error || 'Failed to create user. Please try again.' 
        })
        return
      }

      // Success - reset loading and redirect to users list
      setLoading(false)
      
      // Dispatch custom event to notify users page of successful creation
      window.dispatchEvent(new CustomEvent('userCreated', { detail: result.user }))
      
      router.push('/dashboard/users')
      return
      
    } catch (error) {
      console.error('Unexpected error:', error)
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear errors when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }

    // Handle district change - reset location and fetch new locations
    if (field === 'district_id' && typeof value === 'string') {
      setFormData(prev => ({ ...prev, location_id: '' }))
      if (value) {
        fetchLocations(value)
      } else {
        setLocations([])
      }
    }

    // Handle role change - reset assignments
    if (field === 'role' && typeof value === 'string') {
      setFormData(prev => ({
        ...prev,
        district_id: profile?.role === 'district_manager' ? profile.district_id || '' : '',
        location_id: ''
      }))
      
      // If district manager is creating a user, automatically set their district
      if (profile?.role === 'district_manager' && profile.district_id) {
        setFormData(prev => ({ ...prev, district_id: profile.district_id || '' }))
        fetchLocations(profile.district_id)
      }
    }
  }

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading user permissions...</p>
        </div>
      </div>
    )
  }

  // Show loading if no profile yet
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Don't render if user doesn't have permission
  if (!canCreateUsers) {
    return null // Component will redirect
  }

  const availableRoles = profile?.role === 'super_admin' 
    ? ['super_admin', 'district_manager', 'location_manager'] 
    : ['location_manager']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link 
            href="/dashboard/users"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Users
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <UserPlus className="h-8 w-8 mr-3 text-indigo-600" />
          Add New User
        </h1>
        <p className="text-gray-600 mt-2">
          Create a new user account and assign role-based permissions
        </p>
      </div>

      {/* General Error */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">User Information</h2>
          <p className="text-sm text-gray-600 mt-1">Fill in the details for the new user account</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.email ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="user@example.com"
              />
            </div>
            {errors.email && (
              <p className="mt-2 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.full_name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="John Doe"
              />
            </div>
            {errors.full_name && (
              <p className="mt-2 text-sm text-red-600">{errors.full_name}</p>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Role *
            </label>
            <div className="space-y-3">
              {availableRoles.map((role) => {
                const config = roleConfig[role as keyof typeof roleConfig]
                return (
                  <div key={role} className="flex items-start">
                    <input
                      type="radio"
                      id={role}
                      name="role"
                      value={role}
                      checked={formData.role === role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex-1">
                      <label htmlFor={role} className="cursor-pointer">
                        <div className="flex items-center space-x-2">
                          <config.icon className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-900">
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {config.description}
                        </p>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
            {errors.role && (
              <p className="mt-2 text-sm text-red-600">{errors.role}</p>
            )}
          </div>

          {/* District Assignment */}
          {(formData.role === 'district_manager' || formData.role === 'location_manager') && (
            <div>
              <label htmlFor="district" className="block text-sm font-medium text-gray-700 mb-2">
                District Assignment *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  id="district"
                  value={formData.district_id}
                  onChange={(e) => handleInputChange('district_id', e.target.value)}
                  disabled={profile?.role === 'district_manager'}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.district_id ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select a district</option>
                  {loadingDistricts ? (
                    <option disabled>Loading districts...</option>
                  ) : (
                    districts.map((district) => (
                      <option key={district.id} value={district.id}>
                        {district.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {errors.district_id && (
                <p className="mt-2 text-sm text-red-600">{errors.district_id}</p>
              )}
              {profile?.role === 'district_manager' && (
                <p className="mt-1 text-xs text-gray-500">
                  Automatically assigned to your district
                </p>
              )}
            </div>
          )}

          {/* Location Assignment */}
          {formData.role === 'location_manager' && formData.district_id && (
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                Location Assignment *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  id="location"
                  value={formData.location_id}
                  onChange={(e) => handleInputChange('location_id', e.target.value)}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.location_id ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select a location</option>
                  {loadingLocations ? (
                    <option disabled>Loading locations...</option>
                  ) : (
                    locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {errors.location_id && (
                <p className="mt-2 text-sm text-red-600">{errors.location_id}</p>
              )}
            </div>
          )}

          {/* Invitation Settings */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <input
                type="checkbox"
                id="send_invitation"
                checked={formData.send_invitation}
                onChange={(e) => handleInputChange('send_invitation', e.target.checked)}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div className="ml-3">
                <label htmlFor="send_invitation" className="text-sm font-medium text-blue-900 cursor-pointer">
                  Send invitation email
                </label>
                <p className="text-sm text-blue-700 mt-1">
                  When checked, an invitation email will be sent to the user with instructions to set up their account.
                  If unchecked, the account will be created but you'll need to manually send them a password reset link from the Users page.
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <Link
              href="/dashboard/users"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </Link>
            
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating User...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create User
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Help Text */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-amber-800 mb-2 flex items-center">
          <Shield className="h-4 w-4 mr-2" />
          Role Permissions Guide
        </h3>
        <ul className="text-sm text-amber-700 space-y-2">
          <li className="flex items-start">
            <Crown className="h-4 w-4 mt-0.5 mr-2 text-purple-600" />
            <div>
              <strong>Super Admin:</strong> Full system access, can manage all users, districts, locations, and screens across the organization
            </div>
          </li>
          <li className="flex items-start">
            <Building2 className="h-4 w-4 mt-0.5 mr-2 text-blue-600" />
            <div>
              <strong>District Manager:</strong> Can manage locations and location managers within their assigned district
            </div>
          </li>
          <li className="flex items-start">
            <MapPin className="h-4 w-4 mt-0.5 mr-2 text-green-600" />
            <div>
              <strong>Location Manager:</strong> Can manage screens and content at their assigned location
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}