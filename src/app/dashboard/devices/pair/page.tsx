'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, Monitor, ArrowRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Screen {
  id: string
  name: string
  screen_type: string
  location?: {
    name: string
    districts?: {
      name: string
    }
  }
  device_id?: string
  device_status?: string
}

export default function PairDevicePage() {
  const router = useRouter()
  const [pairingCode, setPairingCode] = useState('')
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null)
  const [availableScreens, setAvailableScreens] = useState<Screen[]>([])
  const [step, setStep] = useState<'code' | 'screen' | 'pairing' | 'success'>('code')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairingResult, setPairingResult] = useState<any>(null)

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pairingCode || pairingCode.length !== 6) {
      setError('Please enter a valid 6-character pairing code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch available screens for selection
      const screensResponse = await fetch('/api/screens')
      if (!screensResponse.ok) {
        throw new Error('Failed to fetch available screens')
      }
      
      const screensData = await screensResponse.json()
      // Filter out screens that already have devices paired
      const unpaired = screensData.filter((screen: Screen) => !screen.device_id)
      
      if (unpaired.length === 0) {
        setError('No unpaired screens available. All screens already have devices assigned.')
        return
      }

      setAvailableScreens(unpaired)
      setStep('screen')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to verify pairing code')
    } finally {
      setLoading(false)
    }
  }

  const handleScreenSelect = (screen: Screen) => {
    setSelectedScreen(screen)
  }

  const handlePairDevice = async () => {
    if (!selectedScreen || !pairingCode) return

    setLoading(true)
    setError(null)
    setStep('pairing')

    try {
      const response = await fetch('/api/devices/pair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pairing_code: pairingCode.toUpperCase(),
          screen_id: selectedScreen.id
        })
      })

      const data = await response.json()

      if (response.ok) {
        setPairingResult(data)
        setStep('success')
      } else {
        throw new Error(data.error || 'Failed to pair device')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to pair device')
      setStep('screen') // Go back to screen selection
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Smartphone className="h-8 w-8 mr-3 text-indigo-600" />
            Pair Device
          </h1>
          <p className="text-gray-600 mt-2">
            Connect a Raspberry Pi device to one of your screens
          </p>
        </div>
        <Link
          href="/dashboard/screens"
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          Back to Screens
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Progress Steps */}
        <div className="flex items-center mb-8">
          <div className={`flex items-center ${step === 'code' ? 'text-indigo-600' : step === 'screen' || step === 'pairing' || step === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 'code' ? 'bg-indigo-100 text-indigo-600' : step === 'screen' || step === 'pairing' || step === 'success' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {step === 'screen' || step === 'pairing' || step === 'success' ? '✓' : '1'}
            </div>
            <span className="ml-2">Enter Code</span>
          </div>
          <div className="flex-1 h-px bg-gray-200 mx-4" />
          <div className={`flex items-center ${step === 'screen' ? 'text-indigo-600' : step === 'pairing' || step === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 'screen' ? 'bg-indigo-100 text-indigo-600' : step === 'pairing' || step === 'success' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {step === 'pairing' || step === 'success' ? '✓' : '2'}
            </div>
            <span className="ml-2">Select Screen</span>
          </div>
          <div className="flex-1 h-px bg-gray-200 mx-4" />
          <div className={`flex items-center ${step === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 'success' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {step === 'success' ? '✓' : '3'}
            </div>
            <span className="ml-2">Complete</span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Enter Pairing Code */}
        {step === 'code' && (
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Enter Pairing Code</h2>
              <p className="text-gray-600">
                Look at the Pi device screen and enter the 6-character code displayed
              </p>
            </div>
            
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  className="text-center text-2xl font-mono tracking-widest w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              
              <button
                type="submit"
                disabled={loading || pairingCode.length !== 6}
                className="bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Don't see a pairing code?</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>1. Make sure the Pi is powered on and connected to WiFi</p>
                <p>2. Connect an HDMI display to see the pairing screen</p>
                <p>3. Wait for the Pi client to start (may take 2-3 minutes)</p>
                <p>4. The code will appear as large text on the screen</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Screen */}
        {step === 'screen' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select Screen</h2>
              <p className="text-gray-600">
                Choose which screen this Pi device should control
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableScreens.map((screen) => (
                <div
                  key={screen.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedScreen?.id === screen.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                  onClick={() => handleScreenSelect(screen)}
                >
                  <div className="flex items-center">
                    <Monitor className="h-6 w-6 text-gray-400 mr-3" />
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{screen.name}</h3>
                      <p className="text-sm text-gray-500 capitalize">
                        {screen.screen_type.replace('_', ' ')}
                      </p>
                      {screen.location && (
                        <p className="text-xs text-gray-400 mt-1">
                          {screen.location.districts?.name && `${screen.location.districts.name} > `}
                          {screen.location.name}
                        </p>
                      )}
                    </div>
                    {selectedScreen?.id === screen.id && (
                      <CheckCircle className="h-5 w-5 text-indigo-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedScreen && (
              <div className="text-center">
                <button
                  onClick={handlePairDevice}
                  disabled={loading}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Pair Device to {selectedScreen.name}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Pairing in Progress */}
        {step === 'pairing' && (
          <div className="text-center space-y-6">
            <div>
              <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Pairing Device...</h2>
              <p className="text-gray-600">
                Connecting Pi device to {selectedScreen?.name}
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && pairingResult && (
          <div className="text-center space-y-6">
            <div>
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Device Paired Successfully!</h2>
              <p className="text-gray-600">
                The Pi device is now connected to {pairingResult.device?.screen_name}
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-medium text-green-900 mb-2">Device Information</h3>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Device ID:</strong> {pairingResult.device?.device_id}</p>
                <p><strong>Screen:</strong> {pairingResult.device?.screen_name}</p>
                <p><strong>Screen Type:</strong> {pairingResult.device?.screen_type?.replace('_', ' ')}</p>
                <p><strong>Location:</strong> {pairingResult.device?.location?.name}</p>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg text-left">
              <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• The Pi device will automatically sync content and schedules</p>
                <p>• It will start displaying scheduled content immediately</p>
                <p>• You can monitor device status in the Screens page</p>
                <p>• Content updates will sync within 2 minutes</p>
              </div>
            </div>

            <div className="flex space-x-4 justify-center">
              <Link
                href="/dashboard/screens"
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
              >
                View All Screens
              </Link>
              <button
                onClick={() => {
                  setPairingCode('')
                  setSelectedScreen(null)
                  setAvailableScreens([])
                  setStep('code')
                  setPairingResult(null)
                  setError(null)
                }}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200"
              >
                Pair Another Device
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}