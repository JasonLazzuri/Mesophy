'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { Plus, Clock, Zap, Settings, Play, Trash2, Edit } from 'lucide-react'

interface PowerScheduleProfile {
  id: string
  profile_name: string
  device_type: string
  power_on_time: string
  power_off_time: string
  power_timezone: string
  power_energy_saving: boolean
  power_warning_minutes: number
  days_of_week?: number[]
  organization: {
    id: string
    name: string
  }
  created_at: string
  updated_at: string
}

const DEVICE_TYPES = {
  'menu_board': { label: 'Menu Board', icon: '🍽️', description: 'Main menu displays' },
  'promo_board': { label: 'Promo Board', icon: '📢', description: 'Promotional displays' },
  'employee_board': { label: 'Employee Board', icon: '👨‍🍳', description: 'Employee information screens' },
  'room_calendar': { label: 'Room Calendar', icon: '📅', description: 'Meeting room calendar displays' }
}

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
]

const DEFAULT_SCHEDULES = {
  'menu_board': { on: '06:00', off: '23:00', warning: 5 },
  'promo_board': { on: '11:00', off: '21:00', warning: 3 },
  'employee_board': { on: '05:00', off: '23:59', warning: 15 },
  'room_calendar': { on: '07:00', off: '19:00', warning: 10 }
}

export default function PowerSchedulesPage() {
  const [profiles, setProfiles] = useState<PowerScheduleProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<PowerScheduleProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState<PowerScheduleProfile | null>(null)
  
  // Form states
  const [formData, setFormData] = useState({
    profile_name: '',
    device_type: '',
    power_on_time: '',
    power_off_time: '',
    power_energy_saving: true,
    power_warning_minutes: 5,
    days_of_week: [0, 1, 2, 3, 4, 5, 6] // All days by default
  })

  const [applyData, setApplyData] = useState({
    target_device_type: '',
    apply_to_all: false
  })

  useEffect(() => {
    fetchProfiles()
  }, [])

  const fetchProfiles = async () => {
    try {
      const response = await fetch('/api/power-schedules')
      if (!response.ok) throw new Error('Failed to fetch profiles')
      
      const result = await response.json()
      setProfiles(result.data?.profiles || [])
    } catch (error) {
      console.error('Error fetching profiles:', error)
      toast({
        title: "Error",
        description: "Failed to load power schedule profiles",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeviceTypeChange = (deviceType: string) => {
    const defaultSchedule = DEFAULT_SCHEDULES[deviceType as keyof typeof DEFAULT_SCHEDULES]
    setFormData(prev => ({
      ...prev,
      device_type: deviceType,
      power_on_time: defaultSchedule?.on || '06:00',
      power_off_time: defaultSchedule?.off || '23:00',
      power_warning_minutes: defaultSchedule?.warning || 5
    }))
  }

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort()
    }))
  }

  const handleCreateProfile = async () => {
    try {
      if (!formData.profile_name || !formData.device_type) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const response = await fetch('/api/power-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          power_timezone: 'America/Los_Angeles' // PST default
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create profile')
      }

      toast({
        title: "Success",
        description: "Power schedule profile created successfully"
      })

      setCreateDialogOpen(false)
      setFormData({
        profile_name: '',
        device_type: '',
        power_on_time: '',
        power_off_time: '',
        power_energy_saving: true,
        power_warning_minutes: 5,
        days_of_week: [0, 1, 2, 3, 4, 5, 6]
      })
      fetchProfiles()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleEditProfile = (profile: PowerScheduleProfile) => {
    setEditingProfile(profile)
    setFormData({
      profile_name: profile.profile_name,
      device_type: profile.device_type,
      power_on_time: profile.power_on_time,
      power_off_time: profile.power_off_time,
      power_energy_saving: profile.power_energy_saving,
      power_warning_minutes: profile.power_warning_minutes,
      days_of_week: profile.days_of_week || [0, 1, 2, 3, 4, 5, 6]
    })
    setEditDialogOpen(true)
  }

  const handleUpdateProfile = async () => {
    if (!editingProfile) return

    try {
      if (!formData.profile_name || !formData.device_type) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const response = await fetch(`/api/power-schedules/${editingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          power_timezone: 'America/Los_Angeles' // PST default
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update profile')
      }

      toast({
        title: "Success",
        description: "Power schedule profile updated successfully"
      })

      setEditDialogOpen(false)
      setEditingProfile(null)
      setFormData({
        profile_name: '',
        device_type: '',
        power_on_time: '',
        power_off_time: '',
        power_energy_saving: true,
        power_warning_minutes: 5,
        days_of_week: [0, 1, 2, 3, 4, 5, 6]
      })
      fetchProfiles()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleApplyProfile = async () => {
    if (!selectedProfile) return

    try {
      const response = await fetch('/api/power-schedules/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selectedProfile.id,
          target_device_type: applyData.target_device_type || selectedProfile.device_type,
          apply_to_all: applyData.apply_to_all
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to apply profile')
      }

      const result = await response.json()
      
      toast({
        title: "Success",
        description: result.data.message
      })

      setApplyDialogOpen(false)
      setSelectedProfile(null)
      setApplyData({
        target_device_type: '',
        apply_to_all: false
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this power schedule profile?')) return

    try {
      const response = await fetch(`/api/power-schedules/${profileId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete profile')
      }

      toast({
        title: "Success",
        description: "Power schedule profile deleted successfully"
      })

      fetchProfiles()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Power Schedules</h1>
          <p className="text-muted-foreground">
            Manage automatic power scheduling for digital signage displays by device type
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
              <Plus className="w-4 h-4 mr-2" />
              Create Profile
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Power Schedule Profile</DialogTitle>
              <DialogDescription>
                Create a reusable power schedule profile that can be applied to multiple devices of the same type.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="profile_name" className="text-right">
                  Profile Name
                </Label>
                <Input
                  id="profile_name"
                  value={formData.profile_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, profile_name: e.target.value }))}
                  className="col-span-3"
                  placeholder="e.g. Standard Restaurant Hours"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="device_type" className="text-right">
                  Device Type
                </Label>
                <Select value={formData.device_type} onValueChange={handleDeviceTypeChange}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select device type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEVICE_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span>{value.icon}</span>
                          <div>
                            <div className="font-medium">{value.label}</div>
                            <div className="text-sm text-muted-foreground">{value.description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="power_on_time" className="text-right">
                  Power ON Time
                </Label>
                <Input
                  id="power_on_time"
                  type="time"
                  value={formData.power_on_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, power_on_time: e.target.value }))}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="power_off_time" className="text-right">
                  Power OFF Time
                </Label>
                <Input
                  id="power_off_time"
                  type="time"
                  value={formData.power_off_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, power_off_time: e.target.value }))}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="power_energy_saving" className="text-right">
                  Energy Saving
                </Label>
                <div className="col-span-3">
                  <Switch
                    id="power_energy_saving"
                    checked={formData.power_energy_saving}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, power_energy_saving: checked }))}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable additional power-saving features during off hours
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="power_warning_minutes" className="text-right">
                  Warning Minutes
                </Label>
                <Input
                  id="power_warning_minutes"
                  type="number"
                  min="0"
                  max="30"
                  value={formData.power_warning_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, power_warning_minutes: parseInt(e.target.value) || 0 }))}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                  Days of Week
                </Label>
                <div className="col-span-3">
                  <div className="flex gap-2 flex-wrap">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          formData.days_of_week.includes(day.value)
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Select which days the power schedule should apply
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <button 
                onClick={() => setCreateDialogOpen(false)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateProfile}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Create Profile
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Power Schedule Profiles Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile) => (
          <Card key={profile.id} className="relative hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{DEVICE_TYPES[profile.device_type as keyof typeof DEVICE_TYPES]?.icon}</span>
                  <div>
                    <CardTitle className="text-lg">{profile.profile_name}</CardTitle>
                    <CardDescription>
                      {DEVICE_TYPES[profile.device_type as keyof typeof DEVICE_TYPES]?.label}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditProfile(profile)}
                    className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">ON: {profile.power_on_time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium">OFF: {profile.power_off_time}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span className="text-sm">Energy Saving</span>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.power_energy_saving ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                    {profile.power_energy_saving ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <div className="text-sm text-muted-foreground">
                  Warning: {profile.power_warning_minutes} minutes
                </div>

                <div className="pt-2">
                  <button 
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors" 
                    onClick={() => {
                      setSelectedProfile(profile)
                      setApplyData({ target_device_type: profile.device_type, apply_to_all: false })
                      setApplyDialogOpen(true)
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Apply to Devices
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {profiles.length === 0 && (
          <div className="col-span-full">
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Power Schedule Profiles</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first power schedule profile to manage device operating hours
                </p>
                <button 
                  onClick={() => setCreateDialogOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Profile
                </button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Apply Profile Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Power Schedule Profile</DialogTitle>
            <DialogDescription>
              Apply "{selectedProfile?.profile_name}" to multiple devices
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apply_device_type" className="text-right">
                Device Type
              </Label>
              <Select
                value={applyData.target_device_type}
                onValueChange={(value) => setApplyData(prev => ({ ...prev, target_device_type: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select device type to apply to" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEVICE_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{value.icon}</span>
                        <span>{value.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apply_to_all" className="text-right">
                Apply to All
              </Label>
              <div className="col-span-3">
                <Switch
                  id="apply_to_all"
                  checked={applyData.apply_to_all}
                  onCheckedChange={(checked) => setApplyData(prev => ({ ...prev, apply_to_all: checked }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Apply to all devices of this type in your organization
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setApplyDialogOpen(false)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyProfile}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Apply Schedule
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Power Schedule Profile</DialogTitle>
            <DialogDescription>
              Update the power schedule settings for "{editingProfile?.profile_name}"
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_profile_name" className="text-right">
                Profile Name
              </Label>
              <Input
                id="edit_profile_name"
                value={formData.profile_name}
                onChange={(e) => setFormData(prev => ({ ...prev, profile_name: e.target.value }))}
                className="col-span-3"
                placeholder="e.g. Standard Restaurant Hours"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_device_type" className="text-right">
                Device Type
              </Label>
              <Select value={formData.device_type} onValueChange={handleDeviceTypeChange}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEVICE_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{value.icon}</span>
                        <div>
                          <div className="font-medium">{value.label}</div>
                          <div className="text-sm text-muted-foreground">{value.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_power_on_time" className="text-right">
                Power ON Time
              </Label>
              <Input
                id="edit_power_on_time"
                type="time"
                value={formData.power_on_time}
                onChange={(e) => setFormData(prev => ({ ...prev, power_on_time: e.target.value }))}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_power_off_time" className="text-right">
                Power OFF Time
              </Label>
              <Input
                id="edit_power_off_time"
                type="time"
                value={formData.power_off_time}
                onChange={(e) => setFormData(prev => ({ ...prev, power_off_time: e.target.value }))}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_power_energy_saving" className="text-right">
                Energy Saving
              </Label>
              <div className="col-span-3">
                <Switch
                  id="edit_power_energy_saving"
                  checked={formData.power_energy_saving}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, power_energy_saving: checked }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Enable additional power-saving features during off hours
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_power_warning_minutes" className="text-right">
                Warning Minutes
              </Label>
              <Input
                id="edit_power_warning_minutes"
                type="number"
                min="0"
                max="30"
                value={formData.power_warning_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, power_warning_minutes: parseInt(e.target.value) || 0 }))}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Days of Week
              </Label>
              <div className="col-span-3">
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        formData.days_of_week.includes(day.value)
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Select which days the power schedule should apply
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => {
                setEditDialogOpen(false)
                setEditingProfile(null)
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateProfile}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Update Profile
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}