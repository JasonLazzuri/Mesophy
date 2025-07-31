'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Image, 
  Video, 
  Upload, 
  Search, 
  Filter, 
  Grid3X3, 
  List, 
  Plus, 
  FolderPlus,
  Folder,
  ChevronRight,
  Home,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Download
} from 'lucide-react'
import { Database } from '@/types/database'
import MediaUpload from '@/components/MediaUpload'
import MediaDetailModal from '@/components/MediaDetailModal'
import MediaEditModal from '@/components/MediaEditModal'
import FolderModal from '@/components/FolderModal'

type MediaAsset = Database['public']['Tables']['media_assets']['Row'] & {
  media_folders?: { name: string } | null
}

type MediaFolder = Database['public']['Tables']['media_folders']['Row'] & {
  itemCount?: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function MediaPage() {
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<MediaFolder[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState<MediaFolder | null>(null)
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null)

  // Fetch media assets
  const fetchMediaAssets = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(searchQuery && { search: searchQuery }),
        ...(mediaTypeFilter !== 'all' && { type: mediaTypeFilter }),
        ...(currentFolderId && { folder_id: currentFolderId })
      })

      const response = await fetch(`/api/media?${params}`)
      if (!response.ok) throw new Error('Failed to fetch media')
      
      const data = await response.json()
      setMediaAssets(data.mediaAssets || [])
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching media:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, searchQuery, mediaTypeFilter, currentFolderId])

  // Fetch folders
  const fetchFolders = useCallback(async () => {
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
  }, [currentFolderId])

  // Load data
  useEffect(() => {
    fetchMediaAssets()
    fetchFolders()
  }, [fetchMediaAssets, fetchFolders])

  // Handle folder navigation
  const navigateToFolder = async (folderId: string | null, folderName?: string) => {
    setCurrentFolderId(folderId)
    setSelectedItems(new Set())
    
    // Update breadcrumb path
    if (folderId === null) {
      setFolderPath([])
    } else if (folderName) {
      // For now, we'll just add to the path. In a real implementation,
      // you'd want to fetch the full path from the API
      const newFolder = folders.find(f => f.id === folderId)
      if (newFolder) {
        setFolderPath(prev => [...prev, newFolder])
      }
    }
  }

  // Handle folder creation/editing
  const handleFolderSave = () => {
    fetchFolders()
    setShowFolderModal(false)
    setEditingFolder(null)
  }

  // Handle media actions
  const handleMediaView = (assetId: string) => {
    setSelectedMediaId(assetId)
    setShowDetailModal(true)
  }

  const handleMediaEdit = (asset: MediaAsset) => {
    setEditingAsset(asset)
    setShowEditModal(true)
    setShowDetailModal(false)
  }

  const handleMediaSave = () => {
    fetchMediaAssets()
    setShowEditModal(false)
    setEditingAsset(null)
  }

  const handleMediaDelete = async (assetId: string) => {
    try {
      const response = await fetch(`/api/media/${assetId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        fetchMediaAssets()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete media')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete media')
    }
  }

  const handleUploadComplete = () => {
    fetchMediaAssets()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return ''
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Image className="h-8 w-8 mr-3 text-indigo-600" />
            Media Library
          </h1>
          <p className="text-gray-600 mt-2">
            Upload and manage videos, images, and other content for your digital displays
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUpload(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Media
          </button>
          <button 
            onClick={() => setShowFolderModal(true)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </button>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      {folderPath.length > 0 && (
        <nav className="flex items-center space-x-2 text-sm text-gray-600">
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

      {/* Toolbar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search media..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Media Type Filter */}
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Media</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </div>

          <div className="flex items-center space-x-3">
            {/* View Toggle */}
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400'}`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading media...</p>
          </div>
        ) : (
          <>
            {/* Folders */}
            {folders.length > 0 && (
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Folders</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigateToFolder(folder.id, folder.name)}
                      className="p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                    >
                      <Folder className="h-8 w-8 text-indigo-600 mb-2" />
                      <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                      <p className="text-xs text-gray-500">{folder.itemCount || 0} items</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Media Assets */}
            {mediaAssets.length === 0 ? (
              <div className="p-12 text-center">
                <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No media files yet</h3>
                <p className="text-gray-600 mb-6">
                  Upload your first media file to get started
                </p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700"
                >
                  Upload Media
                </button>
              </div>
            ) : (
              <div className="p-6">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {mediaAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative border border-gray-200 rounded-lg overflow-hidden hover:border-indigo-300 transition-colors"
                      >
                        {/* Media Preview */}
                        <div className="aspect-square bg-gray-100 flex items-center justify-center">
                          {asset.media_type === 'image' ? (
                            <img
                              src={asset.file_url}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center">
                              <Video className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                              <p className="text-xs text-gray-600">
                                {asset.duration && formatDuration(asset.duration)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => handleMediaView(asset.id)}
                              className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleMediaEdit(asset)}
                              className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(asset.file_size || 0)}</p>
                          {asset.resolution && (
                            <p className="text-xs text-gray-500">{asset.resolution}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mediaAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                          {asset.media_type === 'image' ? (
                            <Image className="h-6 w-6 text-blue-600" />
                          ) : (
                            <Video className="h-6 w-6 text-purple-600" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(asset.file_size || 0)} • {asset.resolution}
                            {asset.duration && ` • ${formatDuration(asset.duration)}`}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={() => handleMediaView(asset.id)}
                            className="p-2 text-gray-400 hover:text-gray-600"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleMediaEdit(asset)}
                            className="p-2 text-gray-400 hover:text-gray-600"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button className="p-2 text-gray-400 hover:text-gray-600">
                            <Download className="h-4 w-4" />
                          </button>
                          <button className="p-2 text-gray-400 hover:text-gray-600">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                      {pagination.total} results
                    </p>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        disabled={pagination.page === 1}
                        className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      
                      <span className="px-3 py-2">
                        {pagination.page} of {pagination.totalPages}
                      </span>
                      
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        disabled={pagination.page === pagination.totalPages}
                        className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <MediaUpload
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        currentFolderId={currentFolderId}
        onUploadComplete={handleUploadComplete}
      />

      <FolderModal
        isOpen={showFolderModal}
        onClose={() => {
          setShowFolderModal(false)
          setEditingFolder(null)
        }}
        folder={editingFolder}
        parentFolderId={currentFolderId}
        onSave={handleFolderSave}
      />

      <MediaDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSelectedMediaId(null)
        }}
        mediaId={selectedMediaId}
        onEdit={handleMediaEdit}
        onDelete={handleMediaDelete}
      />

      <MediaEditModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingAsset(null)
        }}
        asset={editingAsset}
        folders={folders}
        onSave={handleMediaSave}
      />
    </div>
  )
}