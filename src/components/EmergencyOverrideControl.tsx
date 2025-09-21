'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Zap, AlertTriangle, Clock, CheckCircle, Info } from 'lucide-react'

interface EmergencyStatus {
  is_active: boolean
  interval_seconds: number
  timeout_hours: number
  timeout_info?: {
    started_at: string
    will_timeout_at: string
    remaining_minutes: number
    has_timed_out: boolean
  }
}

export default function EmergencyOverrideControl() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<EmergencyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.role === 'super_admin') {
      fetchStatus()
      // Refresh status every 30 seconds to show updated timeout info
      const interval = setInterval(fetchStatus, 30000)
      return () => clearInterval(interval)
    }
  }, [profile])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/emergency-override')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch emergency status')
      }

      setStatus(data.emergency_status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  const toggleEmergencyOverride = async () => {
    if (!status) return

    try {
      setUpdating(true)
      setError(null)
      setSuccess(null)

      const action = status.is_active ? 'deactivate' : 'activate'
      
      const response = await fetch('/api/admin/emergency-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} emergency override`)
      }

      setSuccess(`Emergency override ${action}d successfully!`)
      
      // Update status with server response
      if (data.current_state) {
        setStatus({
          is_active: data.current_state.emergency_override,
          interval_seconds: status.interval_seconds,
          timeout_hours: data.current_state.emergency_timeout_hours,
          timeout_info: data.current_state.emergency_started_at ? {
            started_at: data.current_state.emergency_started_at,
            will_timeout_at: data.current_state.will_timeout_at,
            remaining_minutes: Math.max(0, Math.floor(
              (new Date(data.current_state.will_timeout_at).getTime() - new Date().getTime()) / (1000 * 60)
            )),
            has_timed_out: false
          } : undefined
        })
      } else {
        // Refresh status if server didn't return current state
        await fetchStatus()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle emergency override')
    } finally {
      setUpdating(false)
    }
  }

  // Don't render for non-super-admins
  if (profile?.role !== 'super_admin') {
    return null
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load emergency override status.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const formatRemainingTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  return (
    <Card className={status.is_active ? 'border-red-200 bg-red-50' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className={`h-5 w-5 ${status.is_active ? 'text-red-600' : 'text-gray-600'}`} />
          Emergency Override
          <Badge variant={status.is_active ? "destructive" : "outline"}>
            {status.is_active ? "ACTIVE" : "Inactive"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Force {status.interval_seconds}-second polling across all devices for urgent content updates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="default" className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Success</AlertTitle>
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        {status.is_active && status.timeout_info && (
          <Alert variant="default" className="border-orange-200 bg-orange-50">
            <Clock className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800">Active Emergency Mode</AlertTitle>
            <AlertDescription className="text-orange-700 space-y-1">
              <div>Started: {new Date(status.timeout_info.started_at).toLocaleString()}</div>
              <div>
                Auto-timeout: {formatRemainingTime(status.timeout_info.remaining_minutes)} remaining
              </div>
              <div className="font-medium">
                All {/* This would show device count if available */} devices now polling every {status.interval_seconds} seconds
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-medium">
              {status.is_active ? 'Deactivate Emergency Mode' : 'Activate Emergency Mode'}
            </div>
            <div className="text-sm text-gray-600">
              {status.is_active 
                ? 'Return to normal restaurant-hours scheduling'
                : 'Switch all devices to high-frequency polling'
              }
            </div>
          </div>
          <Switch
            checked={status.is_active}
            onCheckedChange={toggleEmergencyOverride}
            disabled={updating}
            className="data-[state=checked]:bg-red-600"
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-medium text-gray-900">Emergency Interval</div>
            <div className="text-gray-600">{status.interval_seconds} seconds</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">Auto-Timeout</div>
            <div className="text-gray-600">{status.timeout_hours} hours</div>
          </div>
        </div>

        <Alert variant="default" className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700 text-sm">
            <strong>Use for urgent situations:</strong> Menu price errors, time-sensitive promotions, 
            or critical announcements that need immediate display across all locations.
          </AlertDescription>
        </Alert>

        {updating && (
          <div className="flex items-center justify-center text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
            Updating emergency status...
          </div>
        )}
      </CardContent>
    </Card>
  )
}