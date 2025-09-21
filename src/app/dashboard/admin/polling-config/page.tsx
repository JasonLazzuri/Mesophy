'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Clock, AlertTriangle, CheckCircle, Settings, Zap, Moon, Sun, Coffee } from 'lucide-react'

interface TimePeriod {
  name: string
  start: string
  end: string
  interval_seconds: number
  description: string
}

interface PollingConfig {
  organization_id: string
  timezone: string
  time_periods: TimePeriod[]
  emergency_override: boolean
  emergency_interval_seconds: number
  emergency_timeout_hours: number
  emergency_started_at?: string | null
}

export default function PollingConfigPage() {
  const { user, profile } = useAuth()
  const [config, setConfig] = useState<PollingConfig | null>(null)
  
  // Debug logging for auth state
  console.log('PollingConfigPage render - Auth state:', {
    user: user ? 'present' : 'null',
    profile: profile ? {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      organization_id: profile.organization_id
    } : 'null'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Timezone options
  const timezones = [
    { value: 'America/Los_Angeles', label: 'Pacific Time (PST/PDT)' },
    { value: 'America/Denver', label: 'Mountain Time (MST/MDT)' },
    { value: 'America/Chicago', label: 'Central Time (CST/CDT)' },
    { value: 'America/New_York', label: 'Eastern Time (EST/EDT)' },
    { value: 'America/Phoenix', label: 'Arizona Time (MST)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKST/AKDT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  ]

  useEffect(() => {
    console.log('Polling config page - Auth check:', {
      profile,
      role: profile?.role,
      hasProfile: !!profile,
      isLoading: loading
    })
    
    // Wait for profile to load
    if (!profile) {
      console.log('Profile not loaded yet, waiting...')
      return
    }
    
    if (profile.role !== 'super_admin') {
      console.log('Access denied - role check failed:', {
        currentRole: profile.role,
        requiredRole: 'super_admin'
      })
      setError('Super admin access required')
      setLoading(false)
      return
    }

    console.log('Super admin access confirmed, fetching config...')
    setError(null) // Clear any previous errors
    fetchConfig()
  }, [profile])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/polling-config')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch configuration')
      }

      setConfig(data.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch configuration')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/admin/polling-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timezone: config.timezone,
          time_periods: config.time_periods,
          emergency_interval_seconds: config.emergency_interval_seconds,
          emergency_timeout_hours: config.emergency_timeout_hours,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save configuration')
      }

      setSuccess('Polling configuration saved successfully!')
      setConfig(data.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const updateTimePeriod = (index: number, field: keyof TimePeriod, value: string | number) => {
    if (!config) return

    const newPeriods = [...config.time_periods]
    newPeriods[index] = { ...newPeriods[index], [field]: value }
    setConfig({ ...config, time_periods: newPeriods })
  }

  const formatInterval = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
    return `${Math.round(seconds / 3600)} hours`
  }

  const calculateDailyCalls = (periods: TimePeriod[]): number => {
    let totalCalls = 0
    
    periods.forEach(period => {
      const start = new Date(`2024-01-01 ${period.start}`)
      const end = new Date(`2024-01-01 ${period.end}`)
      
      // Handle periods that cross midnight
      let durationHours: number
      if (end < start) {
        // Crosses midnight
        durationHours = (24 - start.getHours() - start.getMinutes() / 60) + (end.getHours() + end.getMinutes() / 60)
      } else {
        durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      }
      
      const callsPerHour = 3600 / period.interval_seconds
      totalCalls += durationHours * callsPerHour
    })
    
    return Math.round(totalCalls)
  }

  const getPeriodIcon = (name: string) => {
    switch (name) {
      case 'prep_time': return <Coffee className="h-4 w-4" />
      case 'setup_time': return <Sun className="h-4 w-4" />
      case 'service_time': return <Moon className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getPeriodColor = (name: string) => {
    switch (name) {
      case 'prep_time': return 'bg-green-100 text-green-800 border-green-200'
      case 'setup_time': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'service_time': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (profile?.role !== 'super_admin') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Super admin access is required to configure polling settings.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>
            Failed to load polling configuration. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const dailyCalls = calculateDailyCalls(config.time_periods)
  const monthlyCalls = dailyCalls * 30

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Polling Configuration</h1>
          <p className="text-gray-600 mt-1">
            Configure restaurant-hours adaptive polling schedules for your organization
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Super Admin Only
        </Badge>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Global Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Global Settings
            </CardTitle>
            <CardDescription>
              Organization-wide configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="timezone">Time Zone</Label>
              <Select 
                value={config.timezone} 
                onValueChange={(value) => setConfig({...config, timezone: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <Label htmlFor="emergency-interval">Emergency Polling Interval</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min="5"
                  max="60"
                  value={config.emergency_interval_seconds}
                  onChange={(e) => setConfig({
                    ...config, 
                    emergency_interval_seconds: parseInt(e.target.value) || 15
                  })}
                  className="w-20"
                />
                <span className="text-sm text-gray-600">seconds</span>
              </div>
            </div>

            <div>
              <Label htmlFor="emergency-timeout">Emergency Auto-Timeout</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={config.emergency_timeout_hours}
                  onChange={(e) => setConfig({
                    ...config, 
                    emergency_timeout_hours: parseInt(e.target.value) || 4
                  })}
                  className="w-20"
                />
                <span className="text-sm text-gray-600">hours</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Estimate</CardTitle>
            <CardDescription>
              API calls with current settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">
                  {dailyCalls.toLocaleString()}
                </div>
                <div className="text-sm text-blue-600">Calls per day</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {monthlyCalls.toLocaleString()}
                </div>
                <div className="text-sm text-green-600">Calls per month</div>
              </div>
            </div>

            <div className="text-sm text-gray-600 space-y-1">
              <div>• Single device usage</div>
              <div>• Estimated monthly cost: $0 (free tier)</div>
              <div>• 232 devices: ~$98/month</div>
            </div>

            <Separator />

            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                79% reduction
              </div>
              <div className="text-sm text-gray-600">
                vs 15-second constant polling
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Emergency Override
            </CardTitle>
            <CardDescription>
              Quick activation for urgent updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Status</span>
              <Badge variant={config.emergency_override ? "destructive" : "outline"}>
                {config.emergency_override ? "ACTIVE" : "Inactive"}
              </Badge>
            </div>

            {config.emergency_override && config.emergency_started_at && (
              <div className="text-sm text-gray-600">
                <div>Started: {new Date(config.emergency_started_at).toLocaleString()}</div>
                <div>Auto-timeout: {config.emergency_timeout_hours} hours</div>
              </div>
            )}

            <div className="text-sm text-gray-600 space-y-1">
              <div>• Activates {config.emergency_interval_seconds}s polling</div>
              <div>• Affects all devices instantly</div>
              <div>• Auto-timeout after {config.emergency_timeout_hours} hours</div>
              <div>• Cost: ~$0.09 per 4-hour event</div>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {/* Will implement in emergency override section */}}
            >
              Go to Emergency Control
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Time Periods Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Time Periods</CardTitle>
          <CardDescription>
            Configure polling intervals for different restaurant operating periods
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {config.time_periods.map((period, index) => (
            <div key={period.name} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getPeriodIcon(period.name)}
                  <h3 className="font-medium capitalize">
                    {period.name.replace('_', ' ')}
                  </h3>
                  <Badge variant="outline" className={getPeriodColor(period.name)}>
                    {formatInterval(period.interval_seconds)}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-gray-600">{period.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={period.start}
                    onChange={(e) => updateTimePeriod(index, 'start', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={period.end}
                    onChange={(e) => updateTimePeriod(index, 'end', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Polling Interval</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[period.interval_seconds]}
                      onValueChange={([value]) => updateTimePeriod(index, 'interval_seconds', value)}
                      min={5}
                      max={period.name === 'service_time' ? 1800 : 300}
                      step={period.name === 'service_time' ? 60 : 5}
                      className="mt-2"
                    />
                    <div className="text-sm text-gray-600 text-center">
                      {formatInterval(period.interval_seconds)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  )
}