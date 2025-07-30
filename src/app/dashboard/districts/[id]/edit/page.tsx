'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Building2, Save, User, MapPin, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface FormData {
  name: string
  description: string
  manager_id: string | null
}

interface FormErrors {
  name?: string
  description?: string
  manager_id?: string
}

interface District {
  id: string
  name: string
  description: string | null
  manager_id: string | null
  created_at: string
  updated_at: string
  organization_id: string
}

export default function EditDistrictPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingDistrict, setLoadingDistrict] = useState(true)
  const [errors, setErrors] = useState<FormErrors>({})
  const [district, setDistrict] = useState<District | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    manager_id: null,
  })

  // Fetch district data
  useEffect(() => {
    const fetchDistrict = async () => {
      try {
        const resolvedParams = await params
        const response = await fetch(`/api/districts/${resolvedParams.id}`)
        const result = await response.json()
        
        if (!response.ok) {
          router.push('/dashboard/districts')
          return
        }
        
        const districtData = result.district
        setDistrict(districtData)
        setFormData({
          name: districtData.name,
          description: districtData.description || '',
          manager_id: districtData.manager_id,
        })
      } catch (error) {
        console.error('Error fetching district:', error)
        router.push('/dashboard/districts')
      } finally {
        setLoadingDistrict(false)
      }
    }

    fetchDistrict()
  }, [params, router])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'District name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'District name must be at least 2 characters'
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'District name must be less than 100 characters'
    }

    // Description validation
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    } else if (formData.description.trim().length > 500) {
      newErrors.description = 'Description must be less than 500 characters'
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
      const response = await fetch(`/api/districts/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          manager_id: formData.manager_id || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error updating district:', result)
        setErrors({ 
          name: result.error || 'Failed to update district. Please try again.' 
        })
        return
      }

      // Success - redirect to districts list
      router.push('/dashboard/districts')
      
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
      const response = await fetch(`/api/districts/${resolvedParams.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error deleting district:', result)
        setErrors({ 
          name: result.error || 'Failed to delete district. Please try again.' 
        })
        return
      }

      // Success - redirect to districts list
      router.push('/dashboard/districts')
      
    } catch (error) {
      console.error('Unexpected error:', error)
      setErrors({ name: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (loadingDistrict) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!district) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">District not found</p>
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
            href="/dashboard/districts"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Districts
          </Link>
        </div>
        
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-lg text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete District
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Building2 className="h-8 w-8 mr-3 text-indigo-600" />
          Edit District
        </h1>
        <p className="text-gray-600 mt-2">
          Update the district information and settings
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">District Information</h2>
          <p className="text-sm text-gray-600 mt-1">Update the details for this district</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* District Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              District Name *
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
                placeholder="e.g., North District, Downtown Region"
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

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className={`block w-full px-3 py-3 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Describe the geographic area, key characteristics, or strategic importance of this district..."
              maxLength={500}
            />
            {errors.description && (
              <p className="mt-2 text-sm text-red-600">{errors.description}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.description.length}/500 characters
            </p>
          </div>

          {/* District Manager - TODO: Implement user selection */}
          <div>
            <label htmlFor="manager" className="block text-sm font-medium text-gray-700 mb-2">
              District Manager
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="manager"
                value={formData.manager_id || ''}
                onChange={(e) => handleInputChange('manager_id', e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select a district manager (optional)</option>
                <option value="none" disabled>No available managers - create users first</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              District managers can be assigned in the Users section
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <Link
              href="/dashboard/districts"
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
                  Update District
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
              <h3 className="text-lg font-medium text-gray-900 mt-2">Delete District</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete &quot;{district.name}&quot;? This action cannot be undone and will affect all locations in this district.
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