'use client'

import { useState, useEffect } from 'react'
import { 
  X, 
  Download, 
  Edit, 
  Trash2, 
  Tag, 
  Calendar, 
  User, 
  FolderOpen,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2
} from 'lucide-react'
import { Database } from '@/types/database'
import { formatFileSize, formatDuration } from '@/lib/media-utils'

type MediaAsset = Database['public']['Tables']['media_assets']['Row'] & {
  media_folders?: { name: string } | null
  user_profiles?: { full_name: string; email: string } | null
  usage?: Array<{ id: string; name: string }>
}

interface MediaDetailModalProps {
  isOpen: boolean
  onClose: () => void
  mediaId: string | null
  onEdit?: (asset: MediaAsset) => void
  onDelete?: (assetId: string) => void
}

export default function MediaDetailModal({ 
  isOpen, 
  onClose, 
  mediaId, 
  onEdit, 
  onDelete 
}: MediaDetailModalProps) {
  const [asset, setAsset] = useState<MediaAsset | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fetch media asset details
  useEffect(() => {
    if (isOpen && mediaId) {
      fetchAssetDetails()
    } else {
      setAsset(null)
      setError(null)
    }
  }, [isOpen, mediaId])

  const fetchAssetDetails = async () => {
    if (!mediaId) return

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/media/${mediaId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch media details')
      }

      const data = await response.json()
      setAsset(data)
    } catch (err) {
      console.error('Error fetching media details:', err)
      setError(err instanceof Error ? err.message : 'Failed to load media details')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (asset?.file_url) {
      const link = document.createElement('a')
      link.href = asset.file_url
      link.download = asset.file_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const handleEdit = () => {
    if (asset && onEdit) {
      onEdit(asset)
    }
  }

  const handleDelete = async () => {
    if (asset && onDelete) {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${asset.name}"? This action cannot be undone.`
      )
      if (confirmed) {
        onDelete(asset.id)
        onClose()
      }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex">
        {/* Media Preview */}
        <div className="flex-1 bg-gray-900 flex items-center justify-center relative">
          {loading ? (
            <div className="text-center text-white">
              <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading media...</p>
            </div>
          ) : error ? (
            <div className="text-center text-white">
              <p className="text-red-400 mb-2">Error loading media</p>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          ) : asset ? (
            <>
              {asset.media_type === 'image' ? (
                <img
                  src={asset.file_url}
                  alt={asset.name}
                  className="max-w-full max-h-full object-contain"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    src={asset.file_url}
                    controls
                    className="max-w-full max-h-full"
                    crossOrigin="anonymous"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                </div>
              )}

              {/* Fullscreen button */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="absolute top-4 right-4 p-2 bg-black bg-opacity-50 text-white rounded-lg hover:bg-opacity-75"
              >
                <Maximize2 className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>

        {/* Details Panel */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Media Details</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="text-center">
                <div className="animate-spin h-6 w-6 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-600">Loading details...</p>
              </div>
            ) : error ? (
              <div className="text-center text-red-600">
                <p>Error loading details</p>
              </div>
            ) : asset ? (
              <>
                {/* Basic Info */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{asset.name}</h3>
                  {asset.description && (
                    <p className="text-gray-600 text-sm mb-4">{asset.description}</p>
                  )}
                  
                  <div className="flex items-center text-sm text-gray-500 mb-2">
                    {asset.media_type === 'image' ? (
                      <ImageIcon className="h-4 w-4 mr-2" />
                    ) : (
                      <VideoIcon className="h-4 w-4 mr-2" />
                    )}
                    <span className="capitalize">{asset.media_type}</span>
                  </div>
                </div>

                {/* File Details */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">File Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">File name:</span>
                      <span className="font-mono text-gray-900">{asset.file_name}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">File size:</span>
                      <span className="text-gray-900">{formatFileSize(asset.file_size || 0)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600">Format:</span>
                      <span className="text-gray-900">{asset.mime_type}</span>
                    </div>
                    {asset.resolution && (
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">Resolution:</span>
                        <span className="text-gray-900">{asset.resolution}</span>
                      </div>
                    )}
                    {asset.duration && (
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">Duration:</span>
                        <span className="text-gray-900">{formatDuration(asset.duration)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {asset.tags && asset.tags.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <Tag className="h-4 w-4 mr-2" />
                      Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {asset.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location */}
                {asset.media_folders && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Location
                    </h4>
                    <p className="text-sm text-gray-600">{asset.media_folders.name}</p>
                  </div>
                )}

                {/* Usage */}
                {asset.usage && asset.usage.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Used in Playlists</h4>
                    <div className="space-y-2">
                      {asset.usage.map((playlist) => (
                        <div key={playlist.id} className="p-2 bg-gray-50 rounded text-sm">
                          {playlist.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Metadata</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-600 py-1">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>Created: {formatDate(asset.created_at)}</span>
                    </div>
                    {asset.user_profiles && (
                      <div className="flex items-center text-gray-600 py-1">
                        <User className="h-4 w-4 mr-2" />
                        <span>
                          By: {asset.user_profiles.full_name || asset.user_profiles.email}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center text-gray-600 py-1">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>Modified: {formatDate(asset.updated_at)}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Actions */}
          {asset && (
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center justify-center text-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </button>
                
                <button
                  onClick={handleEdit}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center text-sm"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                
                <button
                  onClick={handleDelete}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}