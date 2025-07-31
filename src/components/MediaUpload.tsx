'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, X, AlertCircle, CheckCircle, Loader2, Image, Video } from 'lucide-react'
import { validateFile, formatFileSize, getMediaType, extractFileMetadata } from '@/lib/media-utils'

interface UploadFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
  preview?: string
}

interface MediaUploadProps {
  isOpen: boolean
  onClose: () => void
  currentFolderId?: string | null
  onUploadComplete: () => void
}

export default function MediaUpload({ isOpen, onClose, currentFolderId, onUploadComplete }: MediaUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }, [])

  // Handle file selection
  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles: UploadFile[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      const validation = validateFile(file)
      
      if (!validation.isValid) {
        // Show error for invalid files
        newFiles.push({
          file,
          id: Math.random().toString(36).substring(7),
          progress: 0,
          status: 'error',
          error: validation.error
        })
        continue
      }

      // Create preview URL for images
      let preview: string | undefined
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file)
      }

      newFiles.push({
        file,
        id: Math.random().toString(36).substring(7),
        progress: 0,
        status: 'pending',
        preview
      })
    }

    setFiles(prev => [...prev, ...newFiles])
  }, [])

  // Remove file from list
  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  // Upload single file
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file } = uploadFile

    try {
      // Extract metadata
      const metadata = await extractFileMetadata(file)

      // Create form data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name.replace(/\.[^/.]+$/, '')) // Remove extension
      
      if (currentFolderId) {
        formData.append('folder_id', currentFolderId)
      }

      // Upload with progress tracking
      const xhr = new XMLHttpRequest()

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { ...f, progress, status: 'uploading' as const }
                : f
            ))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 201) {
            setFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { ...f, progress: 100, status: 'completed' as const }
                : f
            ))
            resolve()
          } else {
            const error = 'Upload failed'
            setFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { ...f, status: 'error' as const, error }
                : f
            ))
            reject(new Error(error))
          }
        })

        xhr.addEventListener('error', () => {
          const error = 'Network error during upload'
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'error' as const, error }
              : f
          ))
          reject(new Error(error))
        })

        xhr.open('POST', '/api/media/upload')
        xhr.send(formData)
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' as const, error: errorMessage }
          : f
      ))
      throw error
    }
  }

  // Upload all files
  const handleUploadAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setUploading(true)

    try {
      // Upload files one by one to avoid overwhelming the server
      for (const file of pendingFiles) {
        await uploadFile(file)
      }
      
      // Call completion callback
      onUploadComplete()
      
      // Close modal after successful upload
      setTimeout(() => {
        handleClose()
      }, 1000)
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  // Close modal and cleanup
  const handleClose = () => {
    // Cleanup preview URLs
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    })
    setFiles([])
    setDragActive(false)
    setUploading(false)
    onClose()
  }

  // Click to select files
  const handleClick = () => {
    fileInputRef.current?.click()
  }

  if (!isOpen) return null

  const pendingFiles = files.filter(f => f.status === 'pending')
  const completedFiles = files.filter(f => f.status === 'completed')
  const errorFiles = files.filter(f => f.status === 'error')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Upload Media</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Upload Area */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${dragActive 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-gray-300 hover:border-gray-400'
              }
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Drop files here or click to select
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Support for images (JPG, PNG, GIF, WebP) and videos (MP4, WebM, MOV)
            </p>
            <p className="text-xs text-gray-500">
              Maximum file size: 50MB for videos, 20MB for images
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-gray-900">
                Files ({files.length})
              </h3>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {files.map((uploadFile) => (
                  <div
                    key={uploadFile.id}
                    className="flex items-center p-3 bg-gray-50 rounded-lg"
                  >
                    {/* Preview */}
                    <div className="flex-shrink-0 w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mr-3">
                      {uploadFile.preview ? (
                        <img
                          src={uploadFile.preview}
                          alt={uploadFile.file.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        getMediaType(uploadFile.file) === 'image' ? (
                          <Image className="h-6 w-6 text-gray-400" />
                        ) : (
                          <Video className="h-6 w-6 text-gray-400" />
                        )
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {uploadFile.file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                      
                      {/* Progress Bar */}
                      {uploadFile.status === 'uploading' && (
                        <div className="mt-2">
                          <div className="bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadFile.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {uploadFile.progress}% uploaded
                          </p>
                        </div>
                      )}

                      {/* Error Message */}
                      {uploadFile.status === 'error' && uploadFile.error && (
                        <p className="text-xs text-red-600 mt-1">
                          {uploadFile.error}
                        </p>
                      )}
                    </div>

                    {/* Status Icon */}
                    <div className="flex-shrink-0 ml-3">
                      {uploadFile.status === 'pending' && (
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {uploadFile.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
                      )}
                      {uploadFile.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                      {uploadFile.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {files.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {pendingFiles.length > 0 && (
                  <span>{pendingFiles.length} files ready to upload</span>
                )}
                {completedFiles.length > 0 && (
                  <span className="text-green-600 ml-3">
                    {completedFiles.length} completed
                  </span>
                )}
                {errorFiles.length > 0 && (
                  <span className="text-red-600 ml-3">
                    {errorFiles.length} failed
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                
                {pendingFiles.length > 0 && (
                  <button
                    onClick={handleUploadAll}
                    disabled={uploading}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}