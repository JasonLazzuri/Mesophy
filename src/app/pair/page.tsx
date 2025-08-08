'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Monitor, Smartphone, Copy, CheckCircle, QrCode, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface PairingInfo {
  type: string
  version: string
  screen_id: string
  screen_name: string
  screen_type: string
  location_name: string
  code: string
  expires_at: string
  dashboard_url: string
}

function MobilePairingContent() {
  const searchParams = useSearchParams()
  const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Try to get pairing data from URL parameters
    const data = searchParams.get('data')
    if (data) {
      try {
        const decoded = decodeURIComponent(data)
        const parsed = JSON.parse(decoded) as PairingInfo
        
        if (parsed.type === 'mesophy-pairing' && parsed.screen_id && parsed.code) {
          setPairingInfo(parsed)
        } else {
          setError('Invalid pairing data format')
        }
      } catch (err) {
        setError('Failed to parse pairing data')
      }
    } else {
      setError('No pairing data found. This page should be accessed by scanning a QR code.')
    }
  }, [searchParams])

  // Timer for expiration countdown
  useEffect(() => {
    if (pairingInfo) {
      const expiresAt = new Date(pairingInfo.expires_at)
      
      const updateTimer = () => {
        const now = new Date()
        const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
        setTimeRemaining(remaining)
        
        if (remaining === 0) {
          setError('Pairing code has expired')
        }
      }
      
      updateTimer()
      const interval = setInterval(updateTimer, 1000)
      return () => clearInterval(interval)
    }
  }, [pairingInfo])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const sendToPi = async () => {
    if (!pairingInfo) return
    
    // Create a shareable text message with pairing instructions
    const message = `Mesophy Digital Signage Pairing Info:

Screen: ${pairingInfo.screen_name}
Location: ${pairingInfo.location_name}
Type: ${pairingInfo.screen_type.replace('_', ' ')}
Code: ${pairingInfo.code}
Expires: ${new Date(pairingInfo.expires_at).toLocaleString()}

Instructions:
1. SSH into your Raspberry Pi or access the terminal
2. Run: curl -X POST ${pairingInfo.dashboard_url}/api/devices/pair-qr \\
   -H "Content-Type: application/json" \\
   -d '{"pairing_data":${JSON.stringify(pairingInfo)}}'
3. The device will automatically pair and start displaying content

Dashboard: ${pairingInfo.dashboard_url}`

    // Try to use Web Share API if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mesophy Device Pairing',
          text: message
        })
      } catch (err) {
        // Fall back to clipboard
        copyToClipboard(message)
      }
    } else {
      // Fall back to clipboard
      copyToClipboard(message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
            <QrCode className="h-8 w-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Device Pairing</h1>
          <p className="text-gray-600">Mesophy Digital Signage</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {pairingInfo && (
          <div className="space-y-6">
            {/* Expiration Warning */}
            {timeRemaining > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                  <span className="text-orange-700 text-sm font-medium">
                    Code expires in: {formatTime(timeRemaining)}
                  </span>
                </div>
              </div>
            )}

            {/* Screen Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Monitor className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{pairingInfo.screen_name}</h3>
                  <p className="text-sm text-gray-600 capitalize">
                    {pairingInfo.screen_type.replace('_', ' ')}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Location:</span> {pairingInfo.location_name}
                </div>
                <div>
                  <span className="font-medium">Expires:</span> {new Date(pairingInfo.expires_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Pairing Code */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="font-medium text-gray-900 mb-3">Pairing Code</h4>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-lg font-mono tracking-widest text-center">
                  {pairingInfo.code}
                </code>
                <button
                  onClick={() => copyToClipboard(pairingInfo.code)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Copy code"
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3 flex items-center">
                <Smartphone className="h-4 w-4 mr-2" />
                Setup Instructions
              </h4>
              <ol className="text-sm text-blue-800 space-y-2">
                <li>1. Connect your Raspberry Pi to power and network</li>
                <li>2. Install the Mesophy Pi Client software</li>
                <li>3. When prompted, enter the pairing code above</li>
                <li>4. The device will automatically connect to this screen</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={sendToPi}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Smartphone className="h-4 w-4" />
                <span>Share Pairing Info</span>
              </button>
              
              <Link
                href={pairingInfo.dashboard_url}
                className="w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Dashboard</span>
              </Link>
            </div>

            {/* Technical Details */}
            <details className="bg-gray-100 rounded-lg">
              <summary className="p-4 cursor-pointer text-sm font-medium text-gray-700">
                Advanced: API Command
              </summary>
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-600 mb-2">
                  For direct API pairing, run this command on your Pi:
                </p>
                <code className="block bg-white p-2 rounded text-xs break-all">
                  curl -X POST {pairingInfo.dashboard_url}/api/devices/pair-qr -H "Content-Type: application/json" -d '{JSON.stringify({ pairing_data: pairingInfo })}'
                </code>
              </div>
            </details>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-gray-500">
          <p>Mesophy Digital Signage Platform</p>
          <p className="mt-1">Scan QR codes from the dashboard to use this helper</p>
        </div>
      </div>
    </div>
  )
}

export default function MobilePairingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <MobilePairingContent />
    </Suspense>
  )
}