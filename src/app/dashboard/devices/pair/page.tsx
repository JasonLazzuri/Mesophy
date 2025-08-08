'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Monitor, ArrowRight, Zap } from 'lucide-react'
import Link from 'next/link'

export default function PairDevicePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to screens page after showing the message
    const timer = setTimeout(() => {
      router.push('/dashboard/screens')
    }, 7000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-6">
          <Zap className="h-8 w-8 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">New and Improved Device Pairing!</h1>
        <p className="text-xl text-gray-600 mb-8">
          We've redesigned the pairing experience to be more intuitive and mobile-friendly.
        </p>
      </div>

      {/* Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Old Way */}
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6">
          <div className="text-center mb-4">
            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm font-medium text-gray-600">OLD</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Code-First Pairing</h3>
          </div>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <span className="font-medium">1.</span>
              <span>Get pairing code from Pi device</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">2.</span>
              <span>Enter code in dashboard</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">3.</span>
              <span>Select which screen to pair</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">4.</span>
              <span>Complete pairing process</span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-orange-100 rounded-lg">
            <p className="text-xs text-orange-700">
              <strong>Issues:</strong> Confusing flow, no mobile support, backwards process
            </p>
          </div>
        </div>

        {/* New Way */}
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <div className="text-center mb-4">
            <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm font-medium text-white">NEW</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Screen-First Pairing</h3>
          </div>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <span className="font-medium">1.</span>
              <span>Click "Pair Device" on the screen you want</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">2.</span>
              <span>Scan QR code with your phone</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">3.</span>
              <span>Send pairing info to your Pi device</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">4.</span>
              <span>Device automatically pairs!</span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-green-100 rounded-lg">
            <p className="text-xs text-green-700">
              <strong>Benefits:</strong> Intuitive flow, QR code support, mobile-friendly, faster setup
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">New Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
              <QrCode className="h-5 w-5 text-blue-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">QR Code Pairing</h4>
            <p className="text-sm text-gray-600">Scan with your phone for instant pairing setup</p>
          </div>
          <div className="text-center">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <Monitor className="h-5 w-5 text-purple-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Screen-First Design</h4>
            <p className="text-sm text-gray-600">Start by selecting the screen you want to pair</p>
          </div>
          <div className="text-center">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Zap className="h-5 w-5 text-green-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Real-time Status</h4>
            <p className="text-sm text-gray-600">Live updates and instant pairing confirmation</p>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center">
        <p className="text-gray-600 mb-4">
          Ready to try the new pairing experience?
        </p>
        <Link
          href="/dashboard/screens"
          className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Screens Page
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
        <p className="text-xs text-gray-500 mt-2">
          Redirecting automatically in a few seconds...
        </p>
      </div>
    </div>
  )
}