'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { 
  ArrowLeft, 
  User, 
  Edit,
  Mail, 
  Crown,
  Building2,
  MapPin,
  Shield,
  Calendar,
  UserX,
  UserCheck,
  MailIcon,
  Clock,
  Activity,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface UserData {
  id: string
  email: string
  full_name: string | null
  role: 'super_admin' | 'district_manager' | 'location_manager'
  organization_id: string | null
  district_id: string | null
  location_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  district?: {
    id: string
    name: string
  } | null
  location?: {
    id: string
    name: string
  } | null
  organization?: {
    id: string
    name: string
  } | null
}

const roleConfig = {
  super_admin: {
    label: 'Super Admin',
    color: 'bg-purple-100 text-purple-800',
    icon: Crown,
    description: 'Full system access across all organizations',
    permissions: [
      'Manage all users, districts, locations, and screens',
      'Create and delete district managers',
      'Access all organizational data',
      'System-wide configuration and settings'
    ]
  },
  district_manager: {
    label: 'District Manager',
    color: 'bg-blue-100 text-blue-800',
    icon: Building2,
    description: 'Manages locations within assigned districts',
    permissions: [
      'Manage location managers in assigned district',
      'View and edit locations in assigned district',
      'Manage screens within district locations',
      'View district-level analytics and reports'
    ]
  },
  location_manager: {
    label: 'Location Manager',
    color: 'bg-green-100 text-green-800',
    icon: MapPin,
    description: 'Manages screens at assigned locations',
    permissions: [
      'Manage screens at assigned location',
      'Upload and manage media content',
      'Create and manage schedules',
      'View location-level analytics'
    ]
  }
}

export default function UserDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { profile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [error, setError] = useState('')

  // Fetch user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const resolvedParams = await params
        const response = await fetch(`/api/users/${resolvedParams.id}`)
        const result = await response.json()
        
        if (!response.ok) {
          setError(result.error || 'User not found')
          return
        }
        
        setUser(result.user)
      } catch (error) {
        console.error('Error fetching user:', error)
        setError('Failed to load user data')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [params])

  const canViewUser = () => {
    if (!user || !profile) return false
    
    // Users can view their own profile
    if (user.id === profile.id) return true
    
    // Super admin can view all
    if (profile.role === 'super_admin') return true
    
    // District managers can view location managers in their district
    if (profile.role === 'district_manager' && 
        user.role === 'location_manager' && 
        user.district_id === profile.district_id) return true
    
    return false
  }

  const canEditUser = () => {
    if (!user || !profile) return false
    
    // Users can edit their own profile
    if (user.id === profile.id) return true
    
    // Super admin can edit all
    if (profile.role === 'super_admin') return true
    
    // District managers can edit location managers in their district
    if (profile.role === 'district_manager' && 
        user.role === 'location_manager' && 
        user.district_id === profile.district_id) return true
    
    return false
  }

  const handleSendInvitation = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`/api/users/${user.id}/invite`, {
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        alert('Invitation sent successfully!')
      } else {
        alert(`Failed to send invitation: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending invitation:', error)
      alert('Failed to send invitation. Please try again.')
    }
  }

  const handleSendPasswordReset = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        alert('Password reset email sent successfully!')
      } else {
        alert(`Failed to send password reset: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending password reset:', error)
      alert('Failed to send password reset. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  if (error || !user || !canViewUser()) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">{error || 'User not found or access denied'}</p>
          <Link 
            href="/dashboard/users"
            className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Users
          </Link>
        </div>
      </div>
    )
  }

  const isOwnProfile = user.id === profile?.id
  const roleInfo = roleConfig[user.role]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link 
            href="/dashboard/users"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Users
          </Link>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Quick Actions */}
          {!isOwnProfile && canEditUser() && (
            <>
              <button
                onClick={handleSendInvitation}
                className="inline-flex items-center px-3 py-2 border border-blue-300 text-sm font-medium rounded-lg text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <MailIcon className="h-4 w-4 mr-2" />
                Send Invitation
              </button>
              
              <button
                onClick={handleSendPasswordReset}
                className="inline-flex items-center px-3 py-2 border border-amber-300 text-sm font-medium rounded-lg text-amber-700 bg-white hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
              >
                <Shield className="h-4 w-4 mr-2" />
                Reset Password
              </button>
            </>
          )}
          
          {canEditUser() && (
            <Link
              href={`/dashboard/users/${user.id}/edit`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <Edit className="h-4 w-4 mr-2" />
              {isOwnProfile ? 'Edit Profile' : 'Edit User'}
            </Link>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <User className="h-8 w-8 mr-3 text-indigo-600" />
          {isOwnProfile ? 'My Profile' : 'User Profile'}
        </h1>
        <p className="text-gray-600 mt-2">
          {isOwnProfile ? 'Your account information and role details' : 'User account information and role details'}
        </p>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-8 bg-gradient-to-r from-indigo-500 to-purple-600">
          <div className="flex items-center space-x-6">
            <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center">
              <User className="h-10 w-10 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">
                {user.full_name || 'No name provided'}
              </h2>
              <p className="text-indigo-100 text-lg">{user.email}</p>
              <div className="flex items-center mt-3 space-x-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white border border-white/30`}>
                  {roleInfo.icon && (
                    <roleInfo.icon className="h-4 w-4 mr-2" />
                  )}
                  {roleInfo.label}
                </span>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  user.is_active 
                    ? 'bg-green-100 text-green-800 border border-green-200' 
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                  {user.is_active ? (
                    <>
                      <UserCheck className="h-4 w-4 mr-2" />
                      Active
                    </>
                  ) : (
                    <>
                      <UserX className="h-4 w-4 mr-2" />
                      Inactive
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="space-y-4">
                <div className="flex items-center">
                  <Mail className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <User className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Full Name</p>
                    <p className="text-sm text-gray-600">{user.full_name || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Member Since</p>
                    <p className="text-sm text-gray-600">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Last Updated</p>
                    <p className="text-sm text-gray-600">
                      {new Date(user.updated_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Role & Assignments */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Role & Assignments</h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <roleInfo.icon className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Role</p>
                    <p className="text-sm text-gray-600">{roleInfo.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{roleInfo.description}</p>
                  </div>
                </div>

                {user.organization && (
                  <div className="flex items-center">
                    <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Organization</p>
                      <p className="text-sm text-gray-600">{user.organization.name}</p>
                    </div>
                  </div>
                )}

                {user.district && (
                  <div className="flex items-center">
                    <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">District</p>
                      <p className="text-sm text-gray-600">{user.district.name}</p>
                    </div>
                  </div>
                )}

                {user.location && (
                  <div className="flex items-center">
                    <MapPin className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Location</p>
                      <p className="text-sm text-gray-600">{user.location.name}</p>
                    </div>
                  </div>
                )}

                {!user.district && !user.location && user.role !== 'super_admin' && (
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 text-amber-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">No assignments</p>
                      <p className="text-sm text-amber-600">This user needs district/location assignment</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Role Permissions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center">
            <Shield className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Role Permissions</h3>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            What this role can access and manage in the system
          </p>
        </div>
        <div className="px-6 py-6">
          <ul className="space-y-3">
            {roleInfo.permissions.map((permission, index) => (
              <li key={index} className="flex items-start">
                <div className="flex-shrink-0 h-2 w-2 bg-indigo-500 rounded-full mt-2 mr-3"></div>
                <span className="text-sm text-gray-700">{permission}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Activity Summary (placeholder for future implementation) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center">
            <Activity className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Activity Summary</h3>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Recent activity and login history
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h4 className="text-sm font-medium text-gray-900 mb-2">Activity Tracking Coming Soon</h4>
            <p className="text-sm text-gray-500">
              User activity, login history, and audit logs will be displayed here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}