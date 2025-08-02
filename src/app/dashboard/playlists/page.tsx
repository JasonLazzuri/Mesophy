'use client'

import { useState, useEffect } from 'react'
import { Plus, Play, Clock, Edit, Trash2, Video, Image, MoreVertical, Search, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

interface MediaAsset {
  id: string
  name: string
  file_url: string
  mime_type: string
  duration: number | null
}

interface PlaylistItem {
  id: string
  media_asset_id: string
  order_index: number
  duration_override: number | null
  transition_type: string
  media_assets: MediaAsset
}

interface Playlist {
  id: string
  organization_id: string
  name: string
  description: string | null
  total_duration: number
  loop_mode: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  playlist_items?: PlaylistItem[]
}

export default function PlaylistsPage() {
  const { user } = useAuth()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [blockingSchedules, setBlockingSchedules] = useState<Array<{id: string, name: string}> | null>(null)

  useEffect(() => {
    fetchPlaylists()
  }, [])

  const fetchPlaylists = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/playlists?include_items=true')
      if (!response.ok) {
        throw new Error('Failed to fetch playlists')
      }
      const data = await response.json()
      setPlaylists(data.playlists || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(null)
    setDeleteError(null)
    setBlockingSchedules(null)
  }

  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      setDeleting(true)
      setDeleteError(null)
      setBlockingSchedules(null)
      
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        
        // Handle specific case where playlist is used in active schedules
        if (response.status === 409 && errorData.schedules) {
          setDeleteError(errorData.error || 'Cannot delete playlist - it is being used in active schedules')
          setBlockingSchedules(errorData.schedules)
          return // Keep modal open to show error
        }
        
        // For other errors, show in modal
        setDeleteError(errorData.error || 'Failed to delete playlist')
        return // Keep modal open to show error
      }
      
      // Success - remove from local state and close modal
      setPlaylists(prev => prev.filter(p => p.id !== playlistId))
      handleCloseDeleteModal()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete playlist')
    } finally {
      setDeleting(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes === 0) {
      return `${remainingSeconds}s`
    }
    return `${minutes}m ${remainingSeconds}s`
  }

  const getMediaTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('video/')) {
      return <Video className="h-4 w-4 text-purple-600" />
    }
    return <Image className="h-4 w-4 text-blue-600" />
  }

  const filteredPlaylists = playlists.filter(playlist =>
    playlist.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    playlist.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Play className="h-8 w-8 mr-3 text-indigo-600" />
            Playlists
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Play className="h-8 w-8 mr-3 text-indigo-600" />
            Playlists
          </h1>
          <p className="text-gray-600 mt-2">
            Create and manage content playlists for your digital displays
          </p>
        </div>
        <Link
          href="/dashboard/playlists/add"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Playlist
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search playlists..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {filteredPlaylists.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Play className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchTerm ? 'No playlists found' : 'No playlists yet'}
          </h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            {searchTerm 
              ? 'Try adjusting your search terms to find what you\'re looking for.'
              : 'Create your first playlist to organize media content for your screens.'
            }
          </p>
          {!searchTerm && (
            <Link
              href="/dashboard/playlists/add"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Playlist
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlaylists.map((playlist) => (
            <div key={playlist.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* Playlist Header */}
              <div className="p-6 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {playlist.name}
                    </h3>
                    {playlist.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {playlist.description}
                      </p>
                    )}
                  </div>
                  <div className="relative ml-4">
                    <button className="p-1 rounded-full hover:bg-gray-100">
                      <MoreVertical className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Playlist Stats */}
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Play className="h-4 w-4 mr-1" />
                    {playlist.playlist_items?.length || 0} items
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {formatDuration(playlist.total_duration)}
                  </div>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-1 ${playlist.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {playlist.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>
              </div>

              {/* Media Preview */}
              {playlist.playlist_items && playlist.playlist_items.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="grid grid-cols-4 gap-2">
                    {playlist.playlist_items.slice(0, 4).map((item, index) => (
                      <div key={item.id} className="relative aspect-video bg-gray-100 rounded overflow-hidden">
                        {item.media_assets.mime_type.startsWith('image/') ? (
                          <img
                            src={item.media_assets.file_url}
                            alt={item.media_assets.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                            <Video className="h-4 w-4 text-gray-500" />
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 bg-black bg-opacity-50 text-white text-xs px-1 rounded-tl">
                          {getMediaTypeIcon(item.media_assets.mime_type)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {playlist.playlist_items.length > 4 && (
                    <p className="text-xs text-gray-500 mt-2">
                      +{playlist.playlist_items.length - 4} more items
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/dashboard/playlists/${playlist.id}/edit`}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Link>
                    <button
                      onClick={() => setShowDeleteModal(playlist.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 capitalize">
                    {playlist.loop_mode}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Playlist</h3>
            
            {!deleteError ? (
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this playlist? This action cannot be undone.
              </p>
            ) : (
              <div className="mb-6">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start mb-4">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-600 font-medium">
                      {deleteError}
                    </p>
                  </div>
                </div>
                
                {blockingSchedules && blockingSchedules.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-700 mb-2 font-medium">
                      The following schedules are using this playlist:
                    </p>
                    <ul className="space-y-1">
                      {blockingSchedules.map((schedule) => (
                        <li key={schedule.id} className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
                          {schedule.name}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-gray-600 mt-3">
                      Please deactivate or delete these schedules before deleting this playlist.
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {deleteError ? 'Close' : 'Cancel'}
              </button>
              {!deleteError && (
                <button
                  onClick={() => handleDeletePlaylist(showDeleteModal)}
                  disabled={deleting}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}