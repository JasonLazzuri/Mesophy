'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import HeroNavigation from '@/components/HeroNavigation'
import HeroSection from '@/components/HeroSection'
import FeatureShowcase from '@/components/FeatureShowcase'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // If user is already authenticated, redirect to dashboard
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  // If user is authenticated, they'll be redirected above
  // Show hero page for non-authenticated users
  return (
    <div className="min-h-screen bg-white">
      <HeroNavigation />
      <HeroSection />
      <FeatureShowcase />
      
      {/* Footer */}
      <footer className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to transform your digital signage?
            </h2>
            <p className="text-gray-600 mb-8">
              Join organizations using Mesophy to manage displays across multiple locations
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="bg-indigo-600 text-white px-8 py-3 rounded-md hover:bg-indigo-700 font-medium text-center"
              >
                Start Managing Your Screens Today
              </a>
              <a
                href="/login"
                className="border border-gray-300 text-gray-700 px-8 py-3 rounded-md hover:bg-gray-50 font-medium text-center"
              >
                Sign In
              </a>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              © 2025 Mesophy Digital Signage Platform. Built with Next.js, TypeScript, and Supabase.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
