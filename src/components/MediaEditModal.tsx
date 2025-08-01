'use client'

import { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import { Database } from '@/types/database'

type MediaAsset = Database['public']['Tables']['media_assets']['Row']
type MediaFolder = Database['public']['Tables']['media_folders']['Row']

interface MediaEditModalProps {
  isOpen: boolean
  onClose: () => void
  asset: MediaAsset | null
  folders: MediaFolder[]
  onSave: () => void
}

export default function MediaEditModal({ 
  isOpen, 
  onClose, 
  asset, 
  folders,
  onSave 
}: MediaEditModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: '',
    folder_id: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes or asset changes
  useEffect(() => {
    if (isOpen && asset) {
      setFormData({
        name: asset.name || '',
        description: asset.description || '',
        tags: asset.tags ? asset.tags.join(', ') : '',
        folder_id: asset.folder_id || ''
      })
      setError(null)
    } else {
      setFormData({
        name: '',
        description: '',
        tags: '',
        folder_id: ''
      })
      setError(null)
    }
  }, [isOpen, asset])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!asset) return

    if (!formData.name.trim()) {
      setError('Media name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Process tags
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      const updateData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        tags: tags.length > 0 ? tags : null,
        folder_id: formData.folder_id || null
      }

      const response = await fetch(`/api/media/${asset.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update media')
      }

      // Success
      onSave()
      onClose()
    } catch (err) {
      console.error('Error updating media:', err)
      setError(err instanceof Error ? err.message : 'Failed to update media')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (!isOpen || !asset) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Edit Media</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex">
          {/* Preview */}
          <div className="w-1/3 bg-gray-100 p-4 flex items-center justify-center">
            {asset.media_type === 'image' ? (
              <img
                src={asset.file_url}
                alt={asset.name}
                className="max-w-full max-h-48 object-contain rounded"
                crossOrigin="anonymous"
              />
            ) : (
              <video
                src={asset.file_url}
                className="max-w-full max-h-48 object-contain rounded"
                controls
                crossOrigin="anonymous"
              />
            )}
          </div>

          {/* Form */}
          <div className="flex-1">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter media name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                />
              </div>

              {/* Tags */}
              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  placeholder="Enter tags separated by commas..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate multiple tags with commas (e.g., menu, promotion, summer)
                </p>
              </div>

              {/* Folder */}
              <div>
                <label htmlFor="folder_id" className="block text-sm font-medium text-gray-700 mb-2">
                  Folder
                </label>
                <select
                  id="folder_id"
                  name="folder_id"
                  value={formData.folder_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                >
                  <option value="">Root folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Info (Read-only) */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">File Information</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>File name:</span>
                    <span className="font-mono">{asset.file_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span>{asset.mime_type}</span>
                  </div>
                  {asset.resolution && (
                    <div className="flex justify-between">
                      <span>Resolution:</span>
                      <span>{asset.resolution}</span>
                    </div>
                  )}
                  {asset.duration && (
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span>{Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.name.trim()}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}