'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Monitor, Users, LogOut, Menu, X, Tv, Image, Calendar } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, signOut, loading } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Debug logging to help troubleshoot navigation issues
  useEffect(() => {
    if (!loading) {
      console.log('Dashboard Layout Debug Info:', {
        profile,
        profileRole: profile?.role,
        profileId: profile?.id,
        profileEmail: profile?.email,
        loading
      })
    }
  }, [profile, loading])

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: Monitor },
    ...(profile?.role === 'super_admin' || profile?.role === 'district_manager'
      ? [
          { name: 'Districts', href: '/dashboard/districts', icon: Building2 },
          { name: 'Locations', href: '/dashboard/locations', icon: Building2 },
        ]
      : []),
    { name: 'Screens', href: '/dashboard/screens', icon: Tv },
    { name: 'Media', href: '/dashboard/media', icon: Image },
    { name: 'Schedules', href: '/dashboard/schedules', icon: Calendar },
    ...(profile?.role === 'super_admin' || profile?.role === 'district_manager'
      ? [{ name: 'Users', href: '/dashboard/users', icon: Users }]
      : []),
  ]

  // Debug navigation rendering
  useEffect(() => {
    if (!loading) {
      console.log('Navigation items being rendered:', navigation.map(item => ({
        name: item.name,
        href: item.href
      })))
      console.log('Role check results:', {
        isSuperAdmin: profile?.role === 'super_admin',
        isDistrictManager: profile?.role === 'district_manager',
        shouldShowDistricts: profile?.role === 'super_admin' || profile?.role === 'district_manager',
        shouldShowUsers: profile?.role === 'super_admin'
      })
    }
  }, [navigation, profile, loading])

  return (
    <ProtectedRoute>
      <div className="h-screen flex bg-gray-50 overflow-hidden">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Enhanced Sidebar - Fixed Full Height */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header Section - Fixed Height */}
          <div className="flex items-center justify-between h-16 px-6 bg-gradient-to-r from-indigo-600 to-purple-700 flex-shrink-0">
            <h1 className="text-xl font-bold text-white tracking-tight">Digital Signage</h1>
            <button
              className="lg:hidden text-white hover:bg-white/10 p-1 rounded-md transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation Section - Flexible Height */}
          <nav className="flex-1 overflow-y-auto py-6">
            <div className="px-3 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                navigation.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className={`mr-3 h-5 w-5 transition-colors ${
                        isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'
                      }`} />
                      {item.name}
                      {isActive && (
                        <div className="ml-auto h-2 w-2 bg-white/30 rounded-full"></div>
                      )}
                    </Link>
                  )
                })
              )}
            </div>
          </nav>

          {/* Footer Section - Fixed Height */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200">
            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <div className="font-semibold text-amber-800 mb-2 flex items-center">
                  <div className="h-2 w-2 bg-amber-500 rounded-full mr-2"></div>
                  Debug Info
                </div>
                <div className="text-amber-700 space-y-1">
                  <div><span className="font-medium">Role:</span> {profile?.role || 'none'}</div>
                  <div><span className="font-medium">Loading:</span> {loading.toString()}</div>
                  <div><span className="font-medium">Profile ID:</span> {profile?.id?.slice(0, 8) || 'none'}...</div>
                  <div><span className="font-medium">Nav Items:</span> {navigation.length}</div>
                </div>
              </div>
            )}
            
            <div className="bg-gray-50 rounded-xl p-4 mb-3">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {profile?.full_name || profile?.email}
                  </p>
                  <p className="text-xs text-gray-600 capitalize">
                    {profile?.role?.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={signOut}
              className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-700 rounded-xl hover:bg-red-50 hover:text-red-700 transition-all duration-200 group"
            >
              <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-red-500 transition-colors" />
              Sign out
            </button>
          </div>
        </div>

        {/* Main content area - Flex grow to fill remaining space */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Enhanced Top bar */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between h-16 px-6">
              <button
                className="lg:hidden text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="lg:hidden">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Digital Signage</h1>
              </div>
              <div className="flex items-center space-x-4">
                {/* Status indicator */}
                <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                  <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span>All systems operational</span>
                </div>
                {/* Future: Notification bell, user menu, etc. */}
              </div>
            </div>
          </div>

          {/* Enhanced Page content - Flex grow with scrolling */}
          <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}