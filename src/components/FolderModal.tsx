'use client'

import { useState, useEffect } from 'react'
import { X, Folder, AlertCircle } from 'lucide-react'
import { Database } from '@/types/database'

type MediaFolder = Database['public']['Tables']['media_folders']['Row']

interface FolderModalProps {
  isOpen: boolean
  onClose: () => void
  folder?: MediaFolder | null // null for new folder, folder object for edit
  parentFolderId?: string | null
  onSave: () => void
}

export default function FolderModal({ 
  isOpen, 
  onClose, 
  folder, 
  parentFolderId, 
  onSave 
}: FolderModalProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!folder

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setName(folder?.name || '')
      setError(null)
    } else {
      setName('')
      setError(null)
    }
  }, [isOpen, folder])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Folder name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const url = isEditing ? `/api/media/folders/${folder.id}` : '/api/media/folders'
      const method = isEditing ? 'PUT' : 'POST'
      
      const body = {
        name: name.trim(),
        ...(parentFolderId && { parent_folder_id: parentFolderId })
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save folder')
      }

      // Success
      onSave()
      onClose()
    } catch (err) {
      console.error('Error saving folder:', err)
      setError(err instanceof Error ? err.message : 'Failed to save folder')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Folder className="h-6 w-6 mr-2 text-indigo-600" />
            {isEditing ? 'Edit Folder' : 'Create New Folder'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label htmlFor="folderName" className="block text-sm font-medium text-gray-700 mb-2">
              Folder Name
            </label>
            <input
              type="text"
              id="folderName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3">
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
              disabled={loading || !name.trim()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {isEditing ? 'Update Folder' : 'Create Folder'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}