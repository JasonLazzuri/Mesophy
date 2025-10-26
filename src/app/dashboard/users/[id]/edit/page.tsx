'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { 
  ArrowLeft, 
  User, 
  Save, 
  Mail, 
  Crown,
  Building2,
  MapPin,
  Shield,
  Trash2,
  AlertCircle,
  UserX,
  UserCheck,
  MailIcon
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

interface UserData {
  id: string
  email: string
  full_name: string | null
  role: 'super_admin' | 'district_manager' | 'location_manager' | 'tech'
  organization_id: string | null
  district_id: string | null
  location_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  district?: {
    id: string
    name: string
  } | null
  location?: {
    id: string
    name: string
  } | null
}

interface FormData {
  full_name: string
  role: 'super_admin' | 'district_manager' | 'location_manager' | 'tech' | ''
  district_id: string
  location_id: string
  is_active: boolean
}

interface FormErrors {
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
  },
  tech: {
    label: 'Tech Support',
    color: 'bg-orange-100 text-orange-800',
    icon: Shield,
    description: 'Manages devices and content but cannot modify organizational structure'
  }
}

export default function EditUserPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { profile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingUser, setLoadingUser] = useState(true)
  const [errors, setErrors] = useState<FormErrors>({})
  const [user, setUser] = useState<UserData | null>(null)
  const [districts, setDistricts] = useState<District[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingDistricts, setLoadingDistricts] = useState(true)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  
  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    role: '',
    district_id: '',
    location_id: '',
    is_active: true,
  })

  // Fetch user data and initialize form
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const resolvedParams = await params
        const response = await fetch(`/api/users/${resolvedParams.id}`)
        const result = await response.json()
        
        if (!response.ok) {
          router.push('/dashboard/users')
          return
        }
        
        const userData = result.user
        setUser(userData)
        setFormData({
          full_name: userData.full_name || '',
          role: userData.role,
          district_id: userData.district_id || '',
          location_id: userData.location_id || '',
          is_active: userData.is_active,
        })

        // Fetch locations if user has a district
        if (userData.district_id) {
          fetchLocations(userData.district_id)
        }
      } catch (error) {
        console.error('Error fetching user:', error)
        router.push('/dashboard/users')
      } finally {
        setLoadingUser(false)
      }
    }

    fetchUser()
  }, [params, router])

  // Fetch districts
  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const response = await fetch('/api/districts')
        const data = await response.json()
        
        if (response.ok) {
          setDistricts(data.districts || [])
        }
      } catch (error) {
        console.error('Error fetching districts:', error)
      } finally {
        setLoadingDistricts(false)
      }
    }

    fetchDistricts()
  }, [])

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
        setLocations([])
      }
    } catch (error) {
      console.error('Error fetching locations:', error)
      setLocations([])
    } finally {
      setLoadingLocations(false)
    }
  }

  const canEditUser = () => {
    if (!user || !profile) return false
    
    // Users can edit their own profile (limited)
    if (user.id === profile.id) return true
    
    // Super admin can edit all
    if (profile.role === 'super_admin') return true
    
    // District managers can edit location managers in their district
    if (profile.role === 'district_manager' && 
        user.role === 'location_manager' && 
        user.district_id === profile.district_id) return true
    
    return false
  }

  const canChangeRole = () => {
    if (!user || !profile) return false
    
    // Users cannot change their own role
    if (user.id === profile.id) return false
    
    // Only super admin can change roles
    return profile.role === 'super_admin'
  }

  const canDeleteUser = () => {
    if (!user || !profile) return false
    
    // Cannot delete yourself
    if (user.id === profile.id) return false
    
    // Super admin can delete all
    if (profile.role === 'super_admin') return true
    
    // District managers can delete location managers in their district
    if (profile.role === 'district_manager' && 
        user.role === 'location_manager' && 
        user.district_id === profile.district_id) return true
    
    return false
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Full name validation
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    } else if (formData.full_name.trim().length < 2) {
      newErrors.full_name = 'Full name must be at least 2 characters'
    }

    // Role validation (if role can be changed)
    if (canChangeRole() && !formData.role) {
      newErrors.role = 'Please select a role'
    }

    // Role-specific validations
    if (formData.role) {
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
    
    if (!validateForm() || !user) {
      return
    }

    setLoading(true)
    
    try {
      const requestData: Record<string, unknown> = {
        full_name: formData.full_name.trim(),
        is_active: formData.is_active,
      }

      // Only include role changes if user can change roles
      if (canChangeRole()) {
        requestData.role = formData.role
        requestData.district_id = formData.district_id || null
        requestData.location_id = formData.location_id || null
      }

      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error updating user:', result)
        setErrors({ 
          general: result.error || 'Failed to update user. Please try again.' 
        })
        return
      }

      // Success - redirect to users list or back to profile
      if (user.id === profile?.id) {
        router.push('/dashboard/users')
      } else {
        router.push('/dashboard/users')
      }
      
    } catch (error) {
      console.error('Unexpected error:', error)
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!user) return
    
    setLoading(true)
    
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        console.error('Error deleting user:', result)
        setErrors({ 
          general: result.error || 'Failed to delete user. Please try again.' 
        })
        return
      }

      // Success - redirect to users list
      router.push('/dashboard/users')
      
    } catch (error) {
      console.error('Unexpected error during delete:', error)
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleSendInvitation = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`/api/users/${user.id}/invite`, {
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        alert('Invitation sent successfully!')
      } else {
        alert(`Failed to send invitation: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending invitation:', error)
      alert('Failed to send invitation. Please try again.')
    }
  }

  const handleSendPasswordReset = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        alert('Password reset email sent successfully!')
      } else {
        alert(`Failed to send password reset: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending password reset:', error)
      alert('Failed to send password reset. Please try again.')
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
  }

  if (loadingUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!user || !canEditUser()) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">User not found or access denied</p>
        </div>
      </div>
    )
  }

  const isOwnProfile = user.id === profile?.id
  const availableRoles = profile?.role === 'super_admin'
    ? ['super_admin', 'district_manager', 'location_manager', 'tech']
    : []

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
        
        <div className="flex items-center space-x-2">
          {/* Quick Actions */}
          {!isOwnProfile && (
            <>
              <button
                onClick={handleSendInvitation}
                className="inline-flex items-center px-3 py-2 border border-blue-300 text-sm font-medium rounded-lg text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <MailIcon className="h-4 w-4 mr-2" />
                Send Invitation
              </button>
              
              <button
                onClick={handleSendPasswordReset}
                className="inline-flex items-center px-3 py-2 border border-amber-300 text-sm font-medium rounded-lg text-amber-700 bg-white hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
              >
                <Shield className="h-4 w-4 mr-2" />
                Reset Password
              </button>
            </>
          )}
          
          {canDeleteUser() && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-lg text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <User className="h-8 w-8 mr-3 text-indigo-600" />
          {isOwnProfile ? 'Edit My Profile' : 'Edit User'}
        </h1>
        <p className="text-gray-600 mt-2">
          {isOwnProfile ? 'Update your account information' : 'Update user information and role assignments'}
        </p>
      </div>

      {/* User Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center">
            <User className="h-8 w-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900">
              {user.full_name || 'No name provided'}
            </h3>
            <p className="text-gray-600">{user.email}</p>
            <div className="flex items-center mt-2 space-x-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleConfig[user.role].color}`}>
                {React.createElement(roleConfig[user.role].icon, { className: "h-3 w-3 mr-1" })}
                {roleConfig[user.role].label}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {user.is_active ? (
                  <>
                    <UserCheck className="h-3 w-3 mr-1" />
                    Active
                  </>
                ) : (
                  <>
                    <UserX className="h-3 w-3 mr-1" />
                    Inactive
                  </>
                )}
              </span>
            </div>
            {(user.district || user.location) && (
              <div className="flex items-center mt-2 text-sm text-gray-500 space-x-4">
                {user.district && (
                  <div className="flex items-center">
                    <Building2 className="h-4 w-4 mr-1" />
                    {user.district.name}
                  </div>
                )}
                {user.location && (
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    {user.location.name}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
          <h2 className="text-lg font-semibold text-gray-900">
            {isOwnProfile ? 'My Information' : 'User Information'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {isOwnProfile ? 'Update your personal information' : 'Update user details and role assignments'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={user.email}
                disabled
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Email addresses cannot be changed
            </p>
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

          {/* Role Selection (if can change) */}
          {canChangeRole() && (
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
          )}

          {/* District Assignment (if applicable) */}
          {canChangeRole() && (formData.role === 'district_manager' || formData.role === 'location_manager') && (
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
            </div>
          )}

          {/* Location Assignment (if applicable) */}
          {canChangeRole() && formData.role === 'location_manager' && formData.district_id && (
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

          {/* Active Status (if not own profile) */}
          {!isOwnProfile && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <div className="ml-3">
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Active User
                  </label>
                  <p className="text-sm text-gray-600 mt-1">
                    When unchecked, the user will be deactivated and unable to access the system.
                  </p>
                </div>
              </div>
            </div>
          )}

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
                  Updating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isOwnProfile ? 'Update Profile' : 'Update User'}
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
              <h3 className="text-lg font-medium text-gray-900 mt-2">Delete User</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete &quot;{user.full_name || user.email}&quot;? This action cannot be undone.
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