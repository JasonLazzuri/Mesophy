'use client'

import { useState, useEffect } from 'react'
import { X, QrCode, Hash, Smartphone, Monitor, MapPin, Clock, CheckCircle, AlertCircle, Loader2, Copy, RefreshCw } from 'lucide-react'

interface Screen {
  id: string
  name: string
  screen_type: string
  resolution: string
  orientation: string
  location?: {
    name: string
    district?: {
      name: string
    }
  }
}

interface PairingData {
  id: string
  screen_id: string
  screen_name: string
  screen_type: string
  location_name: string
  code: string
  qr_code: string
  expires_at: string
  expires_in_minutes: number
  instructions: {
    step1: string
    step2: string
    step3: string
    manual_code: string
  }
}

interface PairingModalProps {
  isOpen: boolean
  onClose: () => void
  screen: Screen
  onSuccess?: () => void
}

export default function PairingModal({ isOpen, onClose, screen, onSuccess }: PairingModalProps) {
  const [step, setStep] = useState<'initiating' | 'waiting' | 'success' | 'error'>('initiating')
  const [pairingData, setPairingData] = useState<PairingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [showManualCode, setShowManualCode] = useState(false)

  // Cleanup function
  const cleanup = () => {
    setStep('initiating')
    setPairingData(null)
    setError(null)
    setTimeRemaining(0)
    setCheckingStatus(false)
    setShowManualCode(false)
  }

  // Close handler
  const handleClose = () => {
    cleanup()
    onClose()
  }

  // Initialize pairing when modal opens
  useEffect(() => {
    if (isOpen && step === 'initiating') {
      initiatePairing()
    }
  }, [isOpen])

  // Timer for expiration countdown
  useEffect(() => {
    if (pairingData && step === 'waiting') {
      const expiresAt = new Date(pairingData.expires_at)
      
      const updateTimer = () => {
        const now = new Date()
        const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
        setTimeRemaining(remaining)
        
        if (remaining === 0) {
          setError('Pairing code has expired')
          setStep('error')
        }
      }
      
      updateTimer()
      const interval = setInterval(updateTimer, 1000)
      return () => clearInterval(interval)
    }
  }, [pairingData, step])

  // Polling for pairing completion
  useEffect(() => {
    if (step === 'waiting' && pairingData) {
      const checkPairingStatus = async () => {
        try {
          setCheckingStatus(true)
          const response = await fetch(`/api/screens/${screen.id}/pair`)
          const result = await response.json()
          
          if (result.is_paired) {
            setStep('success')
            setTimeout(() => {
              onSuccess?.()
              handleClose()
            }, 2000)
          }
        } catch (error) {
          console.error('Error checking pairing status:', error)
        } finally {
          setCheckingStatus(false)
        }
      }

      // Check immediately, then every 3 seconds
      checkPairingStatus()
      const interval = setInterval(checkPairingStatus, 3000)
      return () => clearInterval(interval)
    }
  }, [step, pairingData, screen.id])

  const initiatePairing = async () => {
    try {
      setError(null)
      const response = await fetch(`/api/screens/${screen.id}/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to initiate pairing')
      }

      setPairingData(result.pairing)
      setStep('waiting')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to initiate pairing')
      setStep('error')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <QrCode className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Pair Device to Screen</h2>
              <p className="text-xs sm:text-sm text-gray-500">Connect a Raspberry Pi device</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Screen Information */}
        <div className="p-4 sm:p-6 bg-gray-50 border-b">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Monitor className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{screen.name}</h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 mt-1">
                <span className="capitalize">{screen.screen_type.replace('_', ' ')}</span>
                <span className="hidden sm:inline">•</span>
                <span>{screen.resolution}</span>
                <span className="hidden sm:inline">•</span>
                <span className="capitalize">{screen.orientation}</span>
              </div>
              {screen.location && (
                <div className="flex items-center mt-1 text-xs sm:text-sm text-gray-500">
                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">
                    {screen.location.district && `${screen.location.district.name} > `}
                    {screen.location.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {step === 'initiating' && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Setting up pairing...</h3>
              <p className="text-gray-600">Generating QR code and pairing information</p>
            </div>
          )}

          {step === 'waiting' && pairingData && (
            <div className="space-y-6">
              {/* Timer */}
              <div className="flex items-center justify-center space-x-2 text-sm">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-orange-600">
                  Code expires in: {formatTime(timeRemaining)}
                </span>
                {checkingStatus && (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin ml-2" />
                )}
              </div>

              {/* QR Code Section */}
              <div className="text-center">
                <div className="inline-block p-3 sm:p-4 bg-white border-2 border-gray-200 rounded-lg">
                  <img 
                    src={pairingData.qr_code} 
                    alt="Pairing QR Code" 
                    className="w-32 h-32 sm:w-48 sm:h-48 mx-auto"
                  />
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mt-2 px-2">
                  Scan with your phone to get pairing info for the Pi
                </p>
              </div>

              {/* Manual Code Toggle */}
              <div className="text-center">
                <button
                  onClick={() => setShowManualCode(!showManualCode)}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center justify-center space-x-2 mx-auto"
                >
                  <Hash className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Use manual pairing code instead</span>
                </button>
              </div>

              {/* Manual Code Section */}
              {showManualCode && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Manual Pairing Code</h4>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded border text-lg font-mono tracking-widest text-center">
                      {pairingData.code}
                    </code>
                    <button
                      onClick={() => copyToClipboard(pairingData.code)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                      title="Copy code"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-3 flex items-center">
                  <Smartphone className="h-4 w-4 mr-2" />
                  Pairing Instructions
                </h4>
                <ol className="text-sm text-blue-800 space-y-2">
                  <li>1. {pairingData.instructions.step1}</li>
                  <li>2. {pairingData.instructions.step2}</li>
                  <li>3. {pairingData.instructions.step3}</li>
                </ol>
              </div>

              {/* Waiting Status */}
              <div className="text-center py-4">
                <div className="flex items-center justify-center space-x-2 text-gray-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Waiting for device to connect...</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This will update automatically when the device pairs
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Device Paired Successfully!</h3>
              <p className="text-gray-600 mb-4">
                The Raspberry Pi is now connected to {screen.name}
              </p>
              <div className="bg-green-50 rounded-lg p-4 text-left">
                <h4 className="font-medium text-green-900 mb-2">What happens next?</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Content will begin syncing automatically</li>
                  <li>• Scheduled playlists will start displaying</li>
                  <li>• Device status is monitored in real-time</li>
                  <li>• Updates sync every 2 minutes</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Pairing Failed</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => {
                  setStep('initiating')
                  setError(null)
                  initiatePairing()
                }}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'waiting' && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-6 py-4 bg-gray-50 border-t space-y-2 sm:space-y-0">
            <div className="text-xs sm:text-sm text-gray-500">
              Having trouble? Check the Pi device display for any error messages.
            </div>
            <div className="flex space-x-2 w-full sm:w-auto justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}