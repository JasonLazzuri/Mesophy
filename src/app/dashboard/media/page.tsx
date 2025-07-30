'use client'

import { Image, Video, Upload } from 'lucide-react'

export default function MediaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Image className="h-8 w-8 mr-3 text-indigo-600" />
          Media Library
        </h1>
        <p className="text-gray-600 mt-2">
          Upload and manage videos, images, and other content for your digital displays
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Media Management Coming Soon</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          This section will allow you to upload, organize, and manage all media content 
          that will be displayed on your digital screens.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="p-4 bg-gray-50 rounded-lg">
            <Image className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Images</h4>
            <p className="text-sm text-gray-600 mt-1">Upload promotional images and photos</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Videos</h4>
            <p className="text-sm text-gray-600 mt-1">Upload video content and advertisements</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <Upload className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Bulk Upload</h4>
            <p className="text-sm text-gray-600 mt-1">Upload multiple files at once</p>
          </div>
        </div>
      </div>
    </div>
  )
}