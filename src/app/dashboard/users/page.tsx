'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, usePathname } from 'next/navigation'
import { 
  Users, 
  UserPlus, 
  Shield, 
  Search, 
  Filter, 
  Edit, 
  Eye, 
  Mail, 
  MoreVertical, 
  UserX,
  UserCheck,
  Crown,
  Building2,
  MapPin,
  ChevronDown,
  Key,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'

interface User {
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
}

const roleConfig = {
  super_admin: {
    label: 'Super Admin',
    color: 'bg-purple-100 text-purple-800',
    icon: Crown,
    description: 'Full system access'
  },
  district_manager: {
    label: 'District Manager',
    color: 'bg-blue-100 text-blue-800',
    icon: Building2,
    description: 'Manages district locations'
  },
  location_manager: {
    label: 'Location Manager',
    color: 'bg-green-100 text-green-800',
    icon: MapPin,
    description: 'Manages single location'
  }
}

export default function UsersPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [resettingPassword, setResettingPassword] = useState<string | null>(null)
  const [resetMessage, setResetMessage] = useState('')

  useEffect(() => {
    if (!authLoading) {
      if (profile) {
        fetchUsers()
      } else {
        // Auth completed but no profile - stop loading
        setLoading(false)
        setError('Unable to load user profile')
      }
    }
  }, [authLoading, profile])

  // Refresh users when component mounts or when returning from navigation
  useEffect(() => {
    if (!authLoading && profile) {
      console.log('Component mounted or auth/profile changed, fetching users...')
      fetchUsers()
    }
  }, [authLoading, profile]) // Trigger on auth/profile changes

  // Refresh users when pathname changes (navigation back to this page)
  useEffect(() => {
    if (!authLoading && profile && pathname === '/dashboard/users') {
      console.log('Pathname effect: Refreshing users for /dashboard/users')
      fetchUsers()
    }
  }, [pathname, authLoading, profile])

  // Additional refresh mechanism using router events (for navigation back from add page)
  useEffect(() => {
    const handleRouteChange = () => {
      if (!authLoading && profile) {
        console.log('Route changed, refreshing users...')
        // Small delay to ensure route has fully changed
        setTimeout(() => {
          fetchUsers()
        }, 100)
      }
    }

    const handleFocus = () => {
      if (!authLoading && profile) {
        console.log('Page gained focus, refreshing users...')
        fetchUsers()
      }
    }
    
    const handleVisibilityChange = () => {
      if (!document.hidden && !authLoading && profile) {
        console.log('Page became visible, refreshing users...')
        fetchUsers()
      }
    }

    // Listen for custom user creation event
    const handleUserCreated = (event: CustomEvent) => {
      console.log('User created event received:', event.detail)
      if (!authLoading && profile) {
        // Add a small delay to ensure the API has processed the creation
        setTimeout(() => {
          console.log('Refreshing users list after creation...')
          fetchUsers()
        }, 500)
      }
    }

    // Listen for browser navigation events
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('userCreated', handleUserCreated as EventListener)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('userCreated', handleUserCreated as EventListener)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authLoading, profile])

  const fetchUsers = async () => {
    try {
      console.log('Fetching users...', { profile, authLoading })
      setLoading(true)
      
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (roleFilter) params.append('role', roleFilter)
      if (statusFilter) params.append('status', statusFilter)

      const url = `/api/users?${params.toString()}`
      console.log('Fetching from URL:', url)
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      console.log('Response status:', response.status)
      
      const data = await response.json()
      console.log('Users API response:', data)

      if (!response.ok) {
        console.error('API Error:', data)
        throw new Error(data.error || 'Failed to fetch users')
      }

      console.log('Setting users:', data.users?.length || 0, 'users')
      setUsers(data.users || [])
      setError('') // Clear any previous errors
    } catch (err) {
      console.error('Error fetching users:', err)
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try refreshing the page.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch users')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && profile) {
      const timeoutId = setTimeout(() => {
        fetchUsers()
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [searchTerm, roleFilter, statusFilter, authLoading, profile])

  const handleResetPassword = async (userId: string, userEmail: string) => {
    try {
      setResettingPassword(userId)
      setError('')
      setResetMessage('')

      const response = await fetch(`/api/users/${userId}/reset-password`, {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok) {
        setResetMessage(`Password reset email sent to ${userEmail}`)
        setTimeout(() => setResetMessage(''), 5000) // Clear message after 5 seconds
      } else {
        setError(data.error || 'Failed to send password reset email')
      }
    } catch (err) {
      setError('Failed to send password reset email')
    } finally {
      setResettingPassword(null)
    }
  }

  const canCreateUsers = profile?.role === 'super_admin' || profile?.role === 'district_manager'
  const canViewUser = (user: User) => {
    if (profile?.role === 'super_admin') return true
    if (profile?.role === 'district_manager') {
      return user.role === 'location_manager' && user.district_id === profile.district_id
    }
    return user.id === profile?.id
  }
  const canResetPassword = (user: User) => {
    if (profile?.role === 'super_admin') return true
    if (profile?.role === 'district_manager') {
      return user.role === 'location_manager' && user.district_id === profile.district_id
    }
    return user.id === profile?.id // Users can reset their own password
  }

  const groupedUsers = users.reduce((acc, user) => {
    if (!acc[user.role]) {
      acc[user.role] = []
    }
    acc[user.role].push(user)
    return acc
  }, {} as Record<string, User[]>)

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (profile?.role === 'location_manager') {
    // Location managers can only see their own profile
    const currentUser = users.find(u => u.id === profile.id)
    if (!currentUser) {
      return <div className="text-center py-8">Loading your profile...</div>
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Users className="h-8 w-8 mr-3 text-indigo-600" />
            My Profile
          </h1>
          <p className="text-gray-600 mt-2">
            View and manage your account information
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">
                {currentUser.full_name || currentUser.email}
              </h3>
              <p className="text-gray-600">{currentUser.email}</p>
              <div className="flex items-center mt-2 space-x-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleConfig[currentUser.role].color}`}>
                  {React.createElement(roleConfig[currentUser.role].icon, { className: "h-3 w-3 mr-1" })}
                  {roleConfig[currentUser.role].label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  currentUser.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {currentUser.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <Link
              href={`/dashboard/users/${currentUser.id}/edit`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Profile
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Users className="h-8 w-8 mr-3 text-indigo-600" />
            User Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage user accounts, roles, and permissions across your organization
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              console.log('Manual refresh button clicked')
              fetchUsers()
            }}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          {canCreateUsers && (
            <>
              <Link
                href="/dashboard/users/add"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                onClick={(e) => {
                  console.log('Add User Link clicked')
                  console.log('Profile:', profile)
                  console.log('Can create users:', canCreateUsers)
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add User (Link)
              </Link>
              
              <button
                onClick={() => {
                  console.log('Add User Button clicked - using router.push')
                  console.log('Profile:', profile)
                  console.log('Can create users:', canCreateUsers)
                  router.push('/dashboard/users/add')
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add User (Button)
              </button>
            </>
          )}
          
          <button
            onClick={() => {
              console.log('Refresh button clicked - forcing fresh data fetch')
              setLoading(true)
              fetchUsers()
            }}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        {/* Debug info - remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-gray-500 mt-2">
            Debug: canCreateUsers = {canCreateUsers ? 'true' : 'false'}, role = {profile?.role || 'none'}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {resetMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {resetMessage}
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
          
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="district_manager">District Manager</option>
                  <option value="location_manager">Location Manager</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Users List */}
        <div className="divide-y divide-gray-200">
          {Object.keys(groupedUsers).length === 0 ? (
            <div className="p-6 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm || roleFilter || statusFilter ? 'No users found' : 'No users yet'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || roleFilter || statusFilter
                  ? 'Try adjusting your search terms or filters'
                  : 'Get started by adding your first user'}
              </p>
            </div>
          ) : (
            Object.entries(groupedUsers).map(([role, roleUsers]) => (
              <div key={role} className="p-6">
                <div className="flex items-center mb-4">
                  {React.createElement(roleConfig[role as keyof typeof roleConfig].icon, { className: "h-5 w-5 mr-2 text-gray-600" })}
                  <h3 className="text-lg font-medium text-gray-900">
                    {roleConfig[role as keyof typeof roleConfig].label}
                  </h3>
                  <span className="ml-2 text-sm text-gray-500">
                    ({roleUsers.length})
                  </span>
                </div>
                
                <div className="grid gap-4">
                  {roleUsers.map((user) => (
                    <div key={user.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center">
                            <Users className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-medium text-gray-900">
                                {user.full_name || 'No name provided'}
                              </h4>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {user.is_active ? (
                                  <>
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    Active
                                  </>
                                ) : (
                                  <>
                                    <UserX className="h-3 w-3 mr-1" />
                                    Inactive
                                  </>
                                )}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{user.email}</p>
                            {(user.district || user.location) && (
                              <div className="flex items-center mt-1 text-xs text-gray-500 space-x-3">
                                {user.district && (
                                  <div className="flex items-center">
                                    <Building2 className="h-3 w-3 mr-1" />
                                    {user.district.name}
                                  </div>
                                )}
                                {user.location && (
                                  <div className="flex items-center">
                                    <MapPin className="h-3 w-3 mr-1" />
                                    {user.location.name}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {canViewUser(user) && (
                          <div className="flex items-center space-x-2">
                            <Link
                              href={`/dashboard/users/${user.id}`}
                              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Link>
                            <Link
                              href={`/dashboard/users/${user.id}/edit`}
                              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Link>
                            {canResetPassword(user) && user.is_active && (
                              <button
                                onClick={() => handleResetPassword(user.id, user.email)}
                                disabled={resettingPassword === user.id}
                                className="inline-flex items-center px-3 py-1.5 border border-orange-300 text-xs font-medium rounded text-orange-700 bg-orange-50 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Key className="h-3 w-3 mr-1" />
                                {resettingPassword === user.id ? 'Sending...' : 'Reset Password'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {users.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">User Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Users className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Total Users</p>
                  <p className="text-2xl font-bold text-blue-900">{users.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <UserCheck className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Active Users</p>
                  <p className="text-2xl font-bold text-green-900">
                    {users.filter(u => u.is_active).length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Crown className="h-6 w-6 text-purple-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-purple-600">Admins</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {users.filter(u => u.role === 'super_admin').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-amber-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-amber-600">Managers</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {users.filter(u => u.role === 'district_manager' || u.role === 'location_manager').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}