'use client'

import { useState } from 'react'
import { X, AlertCircle, Loader2, Youtube, CheckCircle } from 'lucide-react'
import { validateYoutubeUrl, fetchYoutubeMetadata, type YouTubeMetadata } from '@/lib/media-utils'

interface YouTubeAddModalProps {
  isOpen: boolean
  onClose: () => void
  currentFolderId?: string | null
  onAddComplete: () => void
}

export default function YouTubeAddModal({ isOpen, onClose, currentFolderId, onAddComplete }: YouTubeAddModalProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null)
  const [success, setSuccess] = useState(false)

  // Validate and fetch metadata
  const handleValidateUrl = async () => {
    setError(null)
    setMetadata(null)

    if (!url.trim()) {
      setError('Please enter a YouTube URL')
      return
    }

    if (!validateYoutubeUrl(url)) {
      setError('Invalid YouTube URL. Please use a valid YouTube video URL.')
      return
    }

    setLoading(true)

    try {
      const data = await fetchYoutubeMetadata(url)

      if (!data) {
        setError('Failed to fetch video information. Please check the URL and try again.')
        return
      }

      setMetadata(data)
    } catch (err) {
      setError('Failed to fetch video information. The video might be private or unavailable.')
      console.error('YouTube metadata fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Add YouTube video to media library
  const handleAddVideo = async () => {
    if (!metadata) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/media/youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          youtube_url: url,
          name: metadata.title,
          folder_id: currentFolderId
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add YouTube video')
      }

      setSuccess(true)
      onAddComplete()

      // Close modal after success
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add YouTube video')
      console.error('YouTube add error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Close modal and reset state
  const handleClose = () => {
    setUrl('')
    setError(null)
    setMetadata(null)
    setSuccess(false)
    setLoading(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Youtube className="h-6 w-6 text-red-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Add YouTube Video</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* URL Input */}
          <div className="mb-6">
            <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-2">
              YouTube Video URL
            </label>
            <div className="flex gap-2">
              <input
                id="youtube-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !metadata) {
                    handleValidateUrl()
                  }
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading || success}
              />
              {!metadata && (
                <button
                  onClick={handleValidateUrl}
                  disabled={loading || !url.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Validate'
                  )}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Supports standard YouTube URLs (youtube.com/watch?v=..., youtu.be/...)
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Success</p>
                <p className="text-sm text-green-700">YouTube video added to media library</p>
              </div>
            </div>
          )}

          {/* Video Preview */}
          {metadata && !success && (
            <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-100 relative">
                <img
                  src={metadata.thumbnailUrl}
                  alt={metadata.title}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    console.error('YouTube thumbnail failed to load:', metadata.thumbnailUrl)
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <div className="absolute bottom-2 right-2">
                  <Youtube className="h-8 w-8 text-white drop-shadow-lg" />
                </div>
              </div>
              <div className="p-4 bg-white">
                <h3 className="font-medium text-gray-900 mb-1">{metadata.title}</h3>
                <p className="text-sm text-gray-500">Video ID: {metadata.videoId}</p>
                {metadata.duration && (
                  <p className="text-sm text-gray-500">
                    Duration: {Math.floor(metadata.duration / 60)}:{String(metadata.duration % 60).padStart(2, '0')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          {!metadata && !error && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">How to add YouTube videos:</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Copy the URL of any YouTube video</li>
                <li>Paste it in the field above</li>
                <li>Click "Validate" to preview the video</li>
                <li>Click "Add to Library" to save it</li>
              </ol>
              <p className="text-xs text-blue-700 mt-3">
                The video will play fullscreen on Android TV devices without controls.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              {success ? 'Close' : 'Cancel'}
            </button>

            {metadata && !success && (
              <button
                onClick={handleAddVideo}
                disabled={loading}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Youtube className="h-4 w-4 mr-2" />
                    Add to Library
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
