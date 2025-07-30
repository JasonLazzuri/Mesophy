'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Monitor, Users, LogOut, Menu, X } from 'lucide-react'
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
    { name: 'Screens', href: '/dashboard/screens', icon: Monitor },
    { name: 'Media', href: '/dashboard/media', icon: Monitor },
    { name: 'Schedules', href: '/dashboard/schedules', icon: Monitor },
    ...(profile?.role === 'super_admin'
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
      <div className="min-h-screen bg-gray-50">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between h-16 px-6 bg-indigo-600">
            <h1 className="text-xl font-semibold text-white">Digital Signage</h1>
            <button
              className="lg:hidden text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="mt-8">
            <div className="px-4 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  )
                })
              )}
            </div>
          </nav>

          <div className="absolute bottom-0 w-full p-4">
            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <div className="font-semibold text-yellow-800 mb-1">Debug Info:</div>
                <div className="text-yellow-700 space-y-1">
                  <div>Role: {profile?.role || 'none'}</div>
                  <div>Loading: {loading.toString()}</div>
                  <div>Profile ID: {profile?.id || 'none'}</div>
                  <div>Nav Items: {navigation.length}</div>
                </div>
              </div>
            )}
            
            <div className="flex items-center px-4 py-2 text-sm text-gray-600">
              <Users className="mr-3 h-5 w-5" />
              <div>
                <p className="font-medium">{profile?.full_name || profile?.email}</p>
                <p className="text-xs text-gray-500 capitalize">
                  {profile?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center px-4 py-2 mt-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:ml-64">
          {/* Top bar */}
          <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between h-16 px-6">
              <button
                className="lg:hidden text-gray-600"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="lg:hidden">
                <h1 className="text-xl font-semibold text-gray-900">Digital Signage</h1>
              </div>
              <div className="flex items-center space-x-4">
                {/* Notification or other top bar items can go here */}
              </div>
            </div>
          </div>

          {/* Page content */}
          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}