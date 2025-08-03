'use client'

import { useState, useEffect } from 'react'
import { X, Search, Image, Video, CheckCircle } from 'lucide-react'
import { Database } from '@/types/database'

type MediaAsset = Database['public']['Tables']['media_assets']['Row']

interface MediaSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  currentFolderId: string | null
  onMediaSelected: (mediaIds: string[]) => void
}

export default function MediaSelectorModal({ 
  isOpen, 
  onClose, 
  currentFolderId,
  onMediaSelected 
}: MediaSelectorModalProps) {
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // Fetch media assets that are NOT in the current folder
  const fetchAvailableMedia = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch media that's either in root (no folder) or in other folders, but not in current folder
      const params = new URLSearchParams({
        limit: '50', // Show more items for selection
        ...(searchQuery && { search: searchQuery })
      })
      
      // If we're in a folder, exclude media from this folder
      if (currentFolderId) {
        params.append('exclude_folder', currentFolderId)
      }

      console.log('MediaSelectorModal - Fetching with params:', params.toString())
      console.log('MediaSelectorModal - Current folder ID:', currentFolderId)
      
      const response = await fetch(`/api/media?${params}`)
      if (!response.ok) throw new Error('Failed to fetch media')
      
      const data = await response.json()
      console.log('MediaSelectorModal - API response:', data)
      console.log('MediaSelectorModal - Media assets found:', data.mediaAssets?.length || 0)
      
      setMediaAssets(data.mediaAssets || [])
    } catch (error) {
      console.error('Error fetching available media:', error)
      setError('Failed to load media')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchAvailableMedia()
      setSelectedItems(new Set())
    }
  }, [isOpen, searchQuery, currentFolderId])

  const handleToggleSelection = (mediaId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(mediaId)) {
      newSelected.delete(mediaId)
    } else {
      newSelected.add(mediaId)
    }
    setSelectedItems(newSelected)
  }

  const handleAddSelected = () => {
    if (selectedItems.size > 0) {
      onMediaSelected(Array.from(selectedItems))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add Existing Media to Folder</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search available media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          {selectedItems.size > 0 && (
            <div className="mt-3 text-sm text-indigo-600">
              {selectedItems.size} file{selectedItems.size !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Loading available media...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              {error}
            </div>
          ) : mediaAssets.length === 0 ? (
            <div className="text-center py-8">
              <Image className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No available media</h3>
              <p className="text-gray-600">
                {currentFolderId 
                  ? "All media files are already in folders or this folder." 
                  : "No media files found. Upload some media first."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaAssets.map((asset) => (
                <div
                  key={asset.id}
                  className={`group relative border rounded-lg overflow-hidden cursor-pointer transition-colors ${
                    selectedItems.has(asset.id) 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                  onClick={() => handleToggleSelection(asset.id)}
                >
                  {/* Selection indicator */}
                  <div className="absolute top-2 right-2 z-10">
                    {selectedItems.has(asset.id) ? (
                      <CheckCircle className="h-5 w-5 text-indigo-600 bg-white rounded-full" />
                    ) : (
                      <div className="h-5 w-5 border-2 border-white rounded-full bg-black bg-opacity-20"></div>
                    )}
                  </div>

                  {/* Media Preview */}
                  <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                    {asset.media_type === 'image' ? (
                      <>
                        <img
                          src={asset.file_url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            e.currentTarget.nextElementSibling?.classList.remove('hidden')
                          }}
                        />
                        <div className="hidden absolute inset-0 flex items-center justify-center">
                          <Image className="h-12 w-12 text-gray-400" />
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <Video className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(asset.file_size || 0)}</p>
                    <p className="text-xs text-gray-400">
                      {asset.media_folders?.name ? `In: ${asset.media_folders.name}` : 'Root folder'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSelected}
            disabled={selectedItems.size === 0}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add {selectedItems.size} File{selectedItems.size !== 1 ? 's' : ''} to Folder
          </button>
        </div>
      </div>
    </div>
  )
}