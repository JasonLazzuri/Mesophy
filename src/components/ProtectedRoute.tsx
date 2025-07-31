'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    // Don't redirect while loading or if already redirecting
    if (loading || isRedirecting) return

    // Check authentication
    if (!user) {
      console.log('No user found, redirecting to login from:', pathname)
      setIsRedirecting(true)
      
      // Use Next.js router for navigation instead of window.location
      router.replace('/login')
      return
    }

    // Check role authorization
    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
      console.log('User role not authorized:', profile.role, 'Required:', allowedRoles)
      setIsRedirecting(true)
      
      // Create a simple unauthorized page or redirect to dashboard
      router.replace('/dashboard')
      return
    }
  }, [user, profile, loading, allowedRoles, router, pathname, isRedirecting])

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show loading state while redirecting
  if (isRedirecting || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Check role authorization (render nothing if not authorized)
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}