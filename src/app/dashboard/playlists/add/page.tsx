'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Play, X, Folder, Home, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

interface MediaAsset {
  id: string
  name: string
  file_url: string
  file_path: string | null
  mime_type: string
  media_type: string | null
  duration: number | null
  width: number | null
  height: number | null
  resolution: string | null
  media_folders?: { name: string } | null
}

interface MediaFolder {
  id: string
  name: string
  parent_folder_id: string | null
  organization_id: string
  created_at: string
  itemCount?: number
}

interface PlaylistItem {
  id: string
  media_asset_id: string
  media_asset: MediaAsset
  order_index: number
  duration_override: number | null
  transition_type: string
}

export default function AddPlaylistPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loopMode, setLoopMode] = useState<'loop' | 'once' | 'shuffle'>('loop')
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [selectedItems, setSelectedItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingMedia, setFetchingMedia] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<MediaFolder[]>([])

  useEffect(() => {
    fetchMediaAssets()
    fetchFolders()
  }, [currentFolderId])

  const fetchMediaAssets = async () => {
    try {
      setFetchingMedia(true)
      setError(null) // Clear any previous errors when fetching new data
      console.log('Fetching media assets for folder:', currentFolderId)
      const params = new URLSearchParams({ limit: '100' })
      if (currentFolderId) {
        params.append('folder_id', currentFolderId)
      }
      
      const response = await fetch(`/api/media?${params}`)
      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('API Error:', errorData)
        throw new Error(errorData.error || 'Failed to fetch media assets')
      }
      
      const data = await response.json()
      console.log('Media data received:', data)
      console.log('Number of media assets:', data.mediaAssets?.length || 0)
      
      setMediaAssets(data.mediaAssets || [])
    } catch (err) {
      console.error('Error fetching media:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setFetchingMedia(false)
    }
  }

  const fetchFolders = async () => {
    try {
      const params = new URLSearchParams()
      if (currentFolderId) {
        params.append('parent_id', currentFolderId)
      }

      const response = await fetch(`/api/media/folders?${params}`)
      if (!response.ok) throw new Error('Failed to fetch folders')
      
      const data = await response.json()
      setFolders(data || [])
    } catch (error) {
      console.error('Error fetching folders:', error)
    }
  }

  const navigateToFolder = (folderId: string | null, folderName?: string) => {
    setCurrentFolderId(folderId)
    
    // Update breadcrumb path
    if (folderId === null) {
      setFolderPath([])
    } else if (folderName) {
      // If clicking on a folder from breadcrumb, truncate path to that point
      const existingIndex = folderPath.findIndex(f => f.id === folderId)
      if (existingIndex >= 0) {
        setFolderPath(prev => prev.slice(0, existingIndex + 1))
      } else {
        // Add new folder to path
        const newFolder = folders.find(f => f.id === folderId)
        if (newFolder) {
          setFolderPath(prev => [...prev, newFolder])
        }
      }
    } else {
      // Navigating to a folder without name (from folder click)
      const newFolder = folders.find(f => f.id === folderId)
      if (newFolder) {
        setFolderPath(prev => [...prev, newFolder])
      }
    }
  }

  const addMediaToPlaylist = (media: MediaAsset) => {
    const newItem: PlaylistItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      media_asset_id: media.id,
      media_asset: media,
      order_index: selectedItems.length,
      duration_override: null,
      transition_type: 'fade'
    }
    setSelectedItems(prev => [...prev, newItem])
  }

  const removeMediaFromPlaylist = (itemId: string) => {
    setSelectedItems(prev => {
      const filtered = prev.filter(item => item.id !== itemId)
      // Reorder items
      return filtered.map((item, index) => ({
        ...item,
        order_index: index
      }))
    })
  }

  const moveItemUp = (index: number) => {
    if (index === 0) return
    
    const items = [...selectedItems]
    const item = items[index]
    items.splice(index, 1)
    items.splice(index - 1, 0, item)
    
    // Update order_index for all items
    const reorderedItems = items.map((item, newIndex) => ({
      ...item,
      order_index: newIndex
    }))
    
    setSelectedItems(reorderedItems)
  }

  const moveItemDown = (index: number) => {
    if (index === selectedItems.length - 1) return
    
    const items = [...selectedItems]
    const item = items[index]
    items.splice(index, 1)
    items.splice(index + 1, 0, item)
    
    // Update order_index for all items
    const reorderedItems = items.map((item, newIndex) => ({
      ...item,
      order_index: newIndex
    }))
    
    setSelectedItems(reorderedItems)
  }

  const updateItemDuration = (itemId: string, duration: number | null) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, duration_override: duration } : item
    ))
  }

  const updateItemTransition = (itemId: string, transition: string) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, transition_type: transition } : item
    ))
  }

  const calculateTotalDuration = () => {
    return selectedItems.reduce((total, item) => {
      const duration = item.duration_override || item.media_asset.duration || 10
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Playlist name is required')
      return
    }

    if (selectedItems.length === 0) {
      setError('Please add at least one media item to the playlist')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const playlistData = {
        name: name.trim(),
        description: description.trim() || null,
        loop_mode: loopMode,
        media_items: selectedItems.map(item => ({
          media_asset_id: item.media_asset_id,
          duration_override: item.duration_override,
          transition_type: item.transition_type
        }))
      }

      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playlistData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create playlist')
      }

      const data = await response.json()
      router.push('/dashboard/playlists')
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

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Play className="h-8 w-8 mr-3 text-indigo-600" />
          Create New Playlist
        </h1>
        <p className="text-gray-600 mt-2">
          Organize media content into a playlist for your digital displays
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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

                <div className="pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Items: {selectedItems.length}</div>
                    <div>Total Duration: {formatDuration(calculateTotalDuration())}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Media Library */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Media Library</h2>
              
              {/* Breadcrumb Navigation */}
              {folderPath.length > 0 && (
                <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                  <button
                    onClick={() => navigateToFolder(null)}
                    className="hover:text-indigo-600 flex items-center"
                  >
                    <Home className="h-4 w-4 mr-1" />
                    Media Library
                  </button>
                  {folderPath.map((folder, index) => (
                    <div key={folder.id} className="flex items-center">
                      <ChevronRight className="h-4 w-4 mx-2" />
                      <button
                        onClick={() => navigateToFolder(folder.id, folder.name)}
                        className="hover:text-indigo-600"
                      >
                        {folder.name}
                      </button>
                    </div>
                  ))}
                </nav>
              )}
              
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
                <div className="max-h-96 overflow-y-auto">
                  {/* Folders */}
                  {folders.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Folders</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => navigateToFolder(folder.id, folder.name)}
                            className="p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                          >
                            <Folder className="h-6 w-6 text-indigo-600 mb-2" />
                            <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                            <p className="text-xs text-gray-500">{folder.itemCount || 0} items</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Media Assets */}
                  {filteredMedia.length === 0 && folders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                      <p className="text-sm">No media assets found</p>
                      <p className="text-xs mt-1">
                        {searchTerm ? 'Try adjusting your search term' : currentFolderId ? 'This folder is empty' : 'Upload some media files first'}
                      </p>
                    </div>
                  ) : filteredMedia.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                      <Folder className="h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-sm">This folder contains no media</p>
                      <p className="text-xs mt-1">Navigate back or choose a different folder</p>
                    </div>
                  ) : (
                    <div>
                      {/* Folder content header with add media actions */}
                      {currentFolderId && (
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                          <h3 className="text-sm font-medium text-gray-900">
                            {folders.length > 0 ? 'Media Files' : `Folder Contents (${filteredMedia.length} items)`}
                          </h3>
                          <div className="text-xs text-gray-500">
                            Browse media or{' '}
                            <button className="text-indigo-600 hover:text-indigo-700 underline">
                              add more files
                            </button>
                            {' '}to this folder
                          </div>
                        </div>
                      )}
                      
                      {folders.length > 0 && !currentFolderId && (
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Media Files</h3>
                      )}
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Playlist Items */}
        {selectedItems.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Playlist Items</h2>
            
            <div className="space-y-3">
              {selectedItems.map((item, index) => (
                <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500 font-mono w-8">{index + 1}</div>
                  
                  <div className="w-16 h-12 bg-gray-200 rounded overflow-hidden">
                    {item.media_asset.mime_type.startsWith('image/') ? (
                      <img
                        src={item.media_asset.file_url}
                        alt={item.media_asset.name}
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
                      {item.media_asset.name}
                    </p>
                  </div>
                  
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3">
          <Link
            href="/dashboard/playlists"
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || selectedItems.length === 0}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Playlist'}
          </button>
        </div>
      </form>
    </div>
  )
}