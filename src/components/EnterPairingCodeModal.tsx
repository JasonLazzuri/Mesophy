'use client'

import { useState } from 'react'
import { X, Hash, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface EnterPairingCodeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function EnterPairingCodeModal({ isOpen, onClose, onSuccess }: EnterPairingCodeModalProps) {
  const [step, setStep] = useState<'input' | 'pairing' | 'success' | 'error'>('input')
  const [pairingCode, setPairingCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedScreen, setSelectedScreen] = useState<string>('')
  const [screens, setScreens] = useState<any[]>([])
  const [loadingScreens, setLoadingScreens] = useState(false)

  // Load available screens when modal opens
  const loadScreens = async () => {
    if (screens.length > 0) return // Already loaded

    setLoadingScreens(true)
    try {
      const response = await fetch('/api/screens')
      const data = await response.json()
      setScreens(data.screens || [])
    } catch (error) {
      console.error('Error loading screens:', error)
      setError('Failed to load available screens')
    } finally {
      setLoadingScreens(false)
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!pairingCode.trim() || !selectedScreen) {
      setError('Please enter a pairing code and select a screen')
      return
    }

    setStep('pairing')
    setError(null)

    try {
      // First, check if the pairing code exists and is valid
      const checkResponse = await fetch(`/api/devices/check-pairing/${pairingCode.trim()}`)
      
      if (!checkResponse.ok) {
        throw new Error('Invalid or expired pairing code')
      }

      const checkData = await checkResponse.json()
      
      if (checkData.paired) {
        throw new Error('This pairing code has already been used')
      }

      // Now pair the device to the selected screen
      const pairResponse = await fetch('/api/devices/pair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pairing_code: pairingCode.trim(),
          screen_id: selectedScreen
        })
      })

      if (!pairResponse.ok) {
        const errorData = await pairResponse.json()
        throw new Error(errorData.error || 'Failed to pair device')
      }

      setStep('success')
      setTimeout(() => {
        onSuccess?.()
        handleClose()
      }, 2000)

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to pair device')
      setStep('error')
    }
  }

  // Reset and close
  const handleClose = () => {
    setStep('input')
    setPairingCode('')
    setError(null)
    setSelectedScreen('')
    onClose()
  }

  // Load screens when modal opens
  if (isOpen && screens.length === 0 && !loadingScreens) {
    loadScreens()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <Hash className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Enter Pairing Code</h2>
              <p className="text-sm text-gray-500">Connect your Raspberry Pi device</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'input' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pairing Code from Pi Device
                </label>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-widest uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  maxLength={8}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the 6-character code displayed on your Pi screen
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Screen to Pair
                </label>
                {loadingScreens ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
                    <span className="ml-2 text-gray-600">Loading screens...</span>
                  </div>
                ) : (
                  <select
                    value={selectedScreen}
                    onChange={(e) => setSelectedScreen(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  >
                    <option value="">Choose a screen...</option>
                    {screens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.name} ({screen.screen_type.replace('_', ' ')}) - {screen.location?.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Instructions:</h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Look at your Pi device's screen</li>
                  <li>2. Copy the 6-character pairing code</li>
                  <li>3. Select which screen this Pi should control</li>
                  <li>4. Click "Pair Device" to connect</li>
                </ol>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pairingCode.trim() || !selectedScreen}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Pair Device
                </button>
              </div>
            </form>
          )}

          {step === 'pairing' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Pairing Device...</h3>
              <p className="text-gray-600">Connecting your Pi to the selected screen</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Device Paired Successfully!</h3>
              <p className="text-gray-600">
                Your Pi is now connected and will start displaying content
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Pairing Failed</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => {
                  setStep('input')
                  setError(null)
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}