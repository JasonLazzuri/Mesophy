'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Monitor, ArrowLeft, Trash2, Settings, Power } from 'lucide-react'
import Link from 'next/link'
import { ScreenType, DeviceStatus, Orientation } from '@/types/database'

interface Screen {
  id: string
  location_id: string
  name: string
  screen_type: ScreenType
  device_id: string | null
  device_status: DeviceStatus
  resolution: string
  orientation: Orientation
  is_active: boolean
  last_heartbeat: string | null
  ip_address: string | null
  firmware_version: string | null
  created_at: string
  updated_at: string
  location?: {
    id: string
    name: string
    district?: {
      id: string
      name: string
    } | null
  } | null
}

export default function EditScreenPage() {
  const router = useRouter()
  const params = useParams()
  const screenId = params.id as string

  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    screen_type: 'menu_board' as ScreenType,
    device_id: '',
    device_status: 'offline' as DeviceStatus,
    resolution: '1920x1080',
    orientation: 'landscape' as Orientation,
    is_active: true,
    ip_address: '',
    firmware_version: ''
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (screenId) {
      fetchScreen()
    }
  }, [screenId])

  const fetchScreen = async () => {
    try {
      const response = await fetch(`/api/screens/${screenId}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch screen')
      }

      const screenData = result.screen
      setScreen(screenData)
      
      // Populate form with screen data
      setFormData({
        name: screenData.name || '',
        screen_type: screenData.screen_type || 'menu_board',
        device_id: screenData.device_id || '',
        device_status: screenData.device_status || 'offline',
        resolution: screenData.resolution || '1920x1080',
        orientation: screenData.orientation || 'landscape',
        is_active: screenData.is_active !== undefined ? screenData.is_active : true,
        ip_address: screenData.ip_address || '',
        firmware_version: screenData.firmware_version || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch screen')
      console.error('Error fetching screen:', err)
    } finally {
      setFetchLoading(false)
    }
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}

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

    // Validate IP address format if provided
    if (formData.ip_address) {
      const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipPattern.test(formData.ip_address)) {
        errors.ip_address = 'Please enter a valid IP address'
      }
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
        device_id: formData.device_id.trim() || null,
        ip_address: formData.ip_address.trim() || null,
        firmware_version: formData.firmware_version.trim() || null
      }

      const response = await fetch(`/api/screens/${screenId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update screen')
      }

      setSuccessMessage('Screen updated successfully!')
      
      // Update local screen data
      setScreen(result.screen)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update screen')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    setError('')

    try {
      console.log('Starting screen deletion for ID:', screenId)
      
      const response = await fetch(`/api/screens/${screenId}`, {
        method: 'DELETE',
      })

      console.log('Delete response status:', response.status)
      console.log('Delete response headers:', response.headers)

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      console.log('Content-Type:', contentType)

      let result
      if (contentType && contentType.includes('application/json')) {
        result = await response.json()
        console.log('Delete response JSON:', result)
      } else {
        const text = await response.text()
        console.log('Delete response text:', text)
        throw new Error('Server returned non-JSON response: ' + text)
      }

      if (!response.ok) {
        console.error('Delete failed with status:', response.status, result)
        throw new Error(result.error || 'Failed to delete screen')
      }

      console.log('Delete successful, redirecting to screens list')
      
      // Close the modal first
      setShowDeleteConfirm(false)
      
      // Try different redirect methods
      try {
        // Method 1: Try window.location (more reliable)
        window.location.href = '/dashboard/screens'
      } catch (redirectError) {
        console.error('Redirect error:', redirectError)
        // Method 2: Fallback to router.push with replace
        router.replace('/dashboard/screens')
      }

    } catch (err) {
      console.error('Delete error:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete screen')
      setShowDeleteConfirm(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const getStatusColor = (status: DeviceStatus) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50'
      case 'offline': return 'text-gray-600 bg-gray-50'
      case 'error': return 'text-red-600 bg-red-50'
      case 'maintenance': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const formatLastSeen = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return 'Never'
    
    const now = new Date()
    const lastSeen = new Date(lastHeartbeat)
    const diffMs = now.getTime() - lastSeen.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!screen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Screen not found or you don't have permission to access it.
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
            href="/dashboard/screens"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Screens
          </Link>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href={`/dashboard/screens/${screenId}`}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            View Details
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Monitor className="h-7 w-7 mr-3 text-indigo-600" />
          Edit Screen: {screen.name}
        </h1>
        <div className="flex items-center mt-2 space-x-4 text-sm text-gray-600">
          <span>{screen.location?.name}</span>
          {screen.location?.district && (
            <>
              <span>•</span>
              <span>{screen.location.district.name}</span>
            </>
          )}
          <span>•</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(screen.device_status)}`}>
            {screen.device_status}
          </span>
          <span>•</span>
          <span>Last seen: {formatLastSeen(screen.last_heartbeat)}</span>
        </div>
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
            Update the screen settings and device configuration
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
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
          </div>

          {/* Screen Type and Status Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <option value="promotional">📢 Promotional Display</option>
                <option value="queue_display">👥 Queue Display</option>
                <option value="outdoor_sign">🏪 Outdoor Sign</option>
              </select>
              {validationErrors.screen_type && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.screen_type}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Device Status
              </label>
              <select
                id="device_status"
                name="device_status"
                value={formData.device_status}
                onChange={handleInputChange}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="error">Error</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          {/* Display Settings Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              </div>

              {/* Network Information Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IP Address
                  </label>
                  <input
                    type="text"
                    id="ip_address"
                    name="ip_address"
                    value={formData.ip_address}
                    onChange={handleInputChange}
                    placeholder="e.g., 192.168.1.100"
                    className={`block w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                      validationErrors.ip_address ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                  {validationErrors.ip_address && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.ip_address}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Firmware Version
                  </label>
                  <input
                    type="text"
                    id="firmware_version"
                    name="firmware_version"
                    value={formData.firmware_version}
                    onChange={handleInputChange}
                    placeholder="e.g., v1.2.3, 2024.01"
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Activity Settings */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-base font-medium text-gray-900 mb-4">Activity Settings</h3>
            <div className="flex items-center">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                checked={formData.is_active}
                onChange={handleInputChange}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                <div className="flex items-center">
                  <Power className="h-4 w-4 mr-2 text-gray-500" />
                  Screen is active (content should display)
                </div>
              </label>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              When inactive, the screen will not display any content but will remain in the system
            </p>
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
                  Updating Screen...
                </>
              ) : (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Update Screen
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowDeleteConfirm(false)} />
            
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Delete Screen
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to delete "<strong>{screen.name}</strong>"? This action cannot be undone and will remove all associated device logs.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? (
                    <>
                      <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Deleting...
                    </>
                  ) : (
                    'Delete Screen'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteLoading}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
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