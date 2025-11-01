'use client'

import { useState } from 'react'

export default function TestYouTubePage() {
  const [videoUrl, setVideoUrl] = useState('')
  const [videoId, setVideoId] = useState('')
  const [embedError, setEmbedError] = useState(false)

  const extractVideoId = (url: string) => {
    try {
      const urlObj = new URL(url)

      // youtube.com/watch?v=VIDEO_ID
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v')
      }

      // youtu.be/VIDEO_ID
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.slice(1)
      }

      return null
    } catch {
      return null
    }
  }

  const handleTest = () => {
    const id = extractVideoId(videoUrl)
    if (id) {
      setVideoId(id)
      setEmbedError(false)
    } else {
      alert('Invalid YouTube URL')
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">YouTube Embed Tester</h1>

        {/* URL Input */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <label className="block text-sm font-medium mb-2">
            YouTube Video URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded"
            />
            <button
              onClick={handleTest}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Test Embed
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Try the Childish Gambino video or any other YouTube URL
          </p>
        </div>

        {/* Embed Test Results */}
        {videoId && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Embed Test Results</h2>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-1">Video ID: <code className="bg-gray-100 px-2 py-1 rounded">{videoId}</code></p>
            </div>

            {/* Method 1: Standard iframe */}
            <div className="mb-8">
              <h3 className="font-medium mb-2">Method 1: Standard iframe</h3>
              <div className="aspect-video bg-black rounded overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onError={() => setEmbedError(true)}
                />
              </div>
              {embedError && (
                <p className="text-red-600 text-sm mt-2">
                  ❌ Embedding failed - This video has embedding disabled
                </p>
              )}
            </div>

            {/* Method 2: With autoplay and no controls (digital signage mode) */}
            <div className="mb-8">
              <h3 className="font-medium mb-2">Method 2: Autoplay + No Controls (Digital Signage Mode)</h3>
              <div className="aspect-video bg-black rounded overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1&fs=0&loop=1&playlist=${videoId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This is how it would appear on Android TV
              </p>
            </div>

            {/* Method 3: YouTube Player API */}
            <div>
              <h3 className="font-medium mb-2">Method 3: YouTube IFrame API</h3>
              <div className="aspect-video bg-black rounded overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                With JavaScript API enabled
              </p>
            </div>

            {/* Test Summary */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
              <h3 className="font-medium text-blue-900 mb-2">What to Look For:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✅ <strong>Success:</strong> Video plays = Embedding is allowed</li>
                <li>❌ <strong>Failure:</strong> Error message or black screen = Embedding disabled</li>
                <li>⚠️ <strong>Note:</strong> Some videos only fail on specific domains</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
