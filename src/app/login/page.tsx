'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  // Check if user is already authenticated
  useEffect(() => {
    let mounted = true
    
    const checkAuth = async () => {
      if (!supabase) {
        if (mounted) setChecking(false)
        return
      }

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && mounted) {
          // User is already logged in, redirect to dashboard
          console.log('User already authenticated, redirecting to dashboard')
          router.replace('/dashboard')
          return
        }
      } catch (error) {
        console.log('Auth check error:', error)
      }
      
      if (mounted) setChecking(false)
    }

    checkAuth()
    
    return () => {
      mounted = false
    }
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!supabase) {
      setError('Authentication service is not available')
      setLoading(false)
      return
    }

    try {
      console.log('Attempting login with:', { email, passwordLength: password.length })
      
      // Clear any existing session first
      await supabase.auth.signOut()
      
      // Small delay to ensure session is cleared
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Login response:', { data, error })

      if (error) {
        console.error('Login error details:', error)
        // Provide more specific error messages
        if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.')
        } else if (error.message.includes('Too many requests')) {
          setError('Too many login attempts. Please wait a moment before trying again.')
        } else {
          setError(`Login failed: ${error.message}`)
        }
      } else if (data.user) {
        console.log('Login successful, redirecting...')
        // Use Next.js router for proper navigation
        router.replace('/dashboard')
      } else {
        setError('Login failed: No user data received')
      }
    } catch (err) {
      console.error('Unexpected login error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Show loading while checking authentication
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Digital Signage Platform
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <span className="text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
                Sign up here
              </Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}