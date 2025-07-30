'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Building2, Save, User, MapPin } from 'lucide-react'
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

export default function AddDistrictPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    manager_id: null,
  })

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

    if (!profile?.organization_id) {
      setErrors({ name: 'Organization not found. Please refresh and try again.' })
      return
    }

    setLoading(true)
    
    try {
      const supabase = createClient()
      
      if (!supabase) {
        setErrors({ name: 'Database connection unavailable. Please try again.' })
        return
      }
      
      const { error } = await supabase
        .from('districts')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim(),
          organization_id: profile.organization_id,
          manager_id: formData.manager_id || null,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating district:', error)
        setErrors({ 
          name: error.message.includes('duplicate') 
            ? 'A district with this name already exists' 
            : 'Failed to create district. Please try again.' 
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
            href="/dashboard/districts"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Districts
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Building2 className="h-8 w-8 mr-3 text-indigo-600" />
          Add New District
        </h1>
        <p className="text-gray-600 mt-2">
          Create a new district to organize restaurant locations by geographic region
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">District Information</h2>
          <p className="text-sm text-gray-600 mt-1">Fill in the details for the new district</p>
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
              District managers can be assigned later in the Users section
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
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create District
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">💡 District Setup Tips</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Choose names that clearly identify the geographic area (e.g., &quot;North District&quot;, &quot;Downtown Region&quot;)</li>
          <li>• Descriptions should help managers understand the scope and characteristics of the district</li>
          <li>• District managers can be assigned later once user accounts are created</li>
          <li>• You can add restaurant locations to this district after creation</li>
        </ul>
      </div>
    </div>
  )
}