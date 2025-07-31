'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Play, X, Save, Eye, Clock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  playlist_items: PlaylistItem[]
}

interface RouteParams {
  params: {
    id: string
  }
}

export default function EditPlaylistPage({ params }: RouteParams) {
  const { user } = useAuth()
  const router = useRouter()
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loopMode, setLoopMode] = useState<'loop' | 'once' | 'shuffle'>('loop')
  const [isActive, setIsActive] = useState(true)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [selectedItems, setSelectedItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingPlaylist, setFetchingPlaylist] = useState(true)
  const [fetchingMedia, setFetchingMedia] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    fetchPlaylist()
    fetchMediaAssets()
  }, [params.id])

  useEffect(() => {
    // Check for changes
    if (playlist) {
      const hasBasicChanges = 
        name !== playlist.name ||
        description !== (playlist.description || '') ||
        loopMode !== playlist.loop_mode ||
        isActive !== playlist.is_active

      const hasItemChanges = 
        selectedItems.length !== playlist.playlist_items.length ||
        selectedItems.some((item, index) => {
          const original = playlist.playlist_items[index]
          return !original || 
            item.media_asset_id !== original.media_asset_id ||
            item.duration_override !== original.duration_override ||
            item.transition_type !== original.transition_type ||
            item.order_index !== original.order_index
        })

      setHasChanges(hasBasicChanges || hasItemChanges)
    }
  }, [name, description, loopMode, isActive, selectedItems, playlist])

  const fetchPlaylist = async () => {
    try {
      setFetchingPlaylist(true)
      const response = await fetch(`/api/playlists/${params.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch playlist')
      }
      const data = await response.json()
      const playlist = data.playlist
      
      setPlaylist(playlist)
      setName(playlist.name)
      setDescription(playlist.description || '')
      setLoopMode(playlist.loop_mode)
      setIsActive(playlist.is_active)
      setSelectedItems([...playlist.playlist_items].sort((a, b) => a.order_index - b.order_index))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setFetchingPlaylist(false)
    }
  }

  const fetchMediaAssets = async () => {
    try {
      setFetchingMedia(true)
      const response = await fetch('/api/media')
      if (!response.ok) {
        throw new Error('Failed to fetch media assets')
      }
      const data = await response.json()
      setMediaAssets(data.media || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setFetchingMedia(false)
    }
  }

  const addMediaToPlaylist = async (media: MediaAsset) => {
    try {
      const response = await fetch(`/api/playlists/${params.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_asset_id: media.id,
          transition_type: 'fade'
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add media to playlist')
      }

      const data = await response.json()
      const newItem = data.playlist_item
      
      setSelectedItems(prev => [...prev, newItem])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add media')
    }
  }

  const removeMediaFromPlaylist = async (itemId: string) => {
    try {
      const response = await fetch(`/api/playlists/${params.id}/items/${itemId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove media from playlist')
      }

      setSelectedItems(prev => prev.filter(item => item.id !== itemId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove media')
    }
  }

  const updateItemInDatabase = async (itemId: string, updates: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/playlists/${params.id}/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update playlist item')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item')
    }
  }

  const moveItemUp = async (index: number) => {
    if (index === 0) return
    
    const items = [...selectedItems]
    const item = items[index]
    items.splice(index, 1)
    items.splice(index - 1, 0, item)
    
    setSelectedItems(items)
    
    // Update order in database
    await reorderItems(items)
  }

  const moveItemDown = async (index: number) => {
    if (index === selectedItems.length - 1) return
    
    const items = [...selectedItems]
    const item = items[index]
    items.splice(index, 1)
    items.splice(index + 1, 0, item)
    
    setSelectedItems(items)
    
    // Update order in database
    await reorderItems(items)
  }

  const reorderItems = async (items: PlaylistItem[]) => {
    try {
      const itemOrders = items.map((item, index) => ({
        id: item.id,
        order_index: index
      }))

      const response = await fetch(`/api/playlists/${params.id}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item_orders: itemOrders }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to reorder items')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder items')
    }
  }

  const updateItemDuration = async (itemId: string, duration: number | null) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, duration_override: duration } : item
    ))
    
    await updateItemInDatabase(itemId, { duration_override: duration })
  }

  const updateItemTransition = async (itemId: string, transition: string) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, transition_type: transition } : item
    ))
    
    await updateItemInDatabase(itemId, { transition_type: transition })
  }

  const calculateTotalDuration = () => {
    return selectedItems.reduce((total, item) => {
      const duration = item.duration_override || item.media_assets.duration || 10
      return total + duration
    }, 0)
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes === 0) {
      return `${remainingSeconds}s`
    }
    return `${minutes}m ${remainingSeconds}s`
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Playlist name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/playlists/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          loop_mode: loopMode,
          is_active: isActive
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update playlist')
      }

      const data = await response.json()
      setPlaylist(data.playlist)
      setHasChanges(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const filteredMedia = mediaAssets.filter(media =>
    media.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedMediaIds = new Set(selectedItems.map(item => item.media_asset_id))

  if (fetchingPlaylist) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Play className="h-8 w-8 mr-3 text-indigo-600" />
            Edit Playlist
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/playlists"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Playlists
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Playlist not found
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/playlists"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Playlists
          </Link>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            {previewMode ? 'Edit Mode' : 'Preview'}
          </button>
          
          <button
            onClick={handleSave}
            disabled={loading || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Play className="h-8 w-8 mr-3 text-indigo-600" />
          Edit Playlist
        </h1>
        <p className="text-gray-600 mt-2">
          Modify your playlist content and settings
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {hasChanges && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
          You have unsaved changes. Click &quot;Save Changes&quot; to save them.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Playlist Settings */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Playlist Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter playlist name"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label htmlFor="loopMode" className="block text-sm font-medium text-gray-700 mb-1">
                  Loop Mode
                </label>
                <select
                  id="loopMode"
                  value={loopMode}
                  onChange={(e) => setLoopMode(e.target.value as 'loop' | 'once' | 'shuffle')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="loop">Loop</option>
                  <option value="once">Play Once</option>
                  <option value="shuffle">Shuffle</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Items: {selectedItems.length}</div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Duration: {formatDuration(calculateTotalDuration())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Media Library and Playlist Content */}
        <div className="lg:col-span-2">
          {!previewMode && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Media</h2>
              
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search media..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {fetchingMedia ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-64 overflow-y-auto">
                  {filteredMedia.map((media) => (
                    <div key={media.id} className="relative group">
                      <div className="aspect-video bg-gray-100 rounded overflow-hidden">
                        {media.mime_type.startsWith('image/') ? (
                          <img
                            src={media.file_url}
                            alt={media.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                            <Play className="h-8 w-8 text-gray-500" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1 truncate">{media.name}</p>
                      <button
                        type="button"
                        onClick={() => addMediaToPlaylist(media)}
                        disabled={selectedMediaIds.has(media.id)}
                        className={`absolute top-2 right-2 p-1.5 rounded-full shadow-sm ${
                          selectedMediaIds.has(media.id)
                            ? 'bg-green-500 text-white cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Playlist Items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Playlist Content ({selectedItems.length} items)
            </h2>
            
            {selectedItems.length === 0 ? (
              <div className="text-center py-12">
                <Play className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No items in this playlist yet.</p>
                <p className="text-sm text-gray-500 mt-1">Add media from the library above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-500 font-mono w-8">{index + 1}</div>
                    
                    <div className="w-16 h-12 bg-gray-200 rounded overflow-hidden">
                      {item.media_assets.mime_type.startsWith('image/') ? (
                        <img
                          src={item.media_assets.file_url}
                          alt={item.media_assets.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                          <Play className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.media_assets.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDuration(item.duration_override || item.media_assets.duration || 10)}
                      </p>
                    </div>
                    
                    {!previewMode && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Duration (s)"
                          value={item.duration_override || ''}
                          onChange={(e) => updateItemDuration(item.id, e.target.value ? parseInt(e.target.value) : null)}
                          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded"
                        />
                        
                        <select
                          value={item.transition_type}
                          onChange={(e) => updateItemTransition(item.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded"
                        >
                          <option value="fade">Fade</option>
                          <option value="slide">Slide</option>
                          <option value="cut">Cut</option>
                          <option value="dissolve">Dissolve</option>
                        </select>
                        
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveItemUp(index)}
                            disabled={index === 0}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItemDown(index)}
                            disabled={index === selectedItems.length - 1}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMediaFromPlaylist(item.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}