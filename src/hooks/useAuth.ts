'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Database } from '@/types/database'

type UserProfile = Database['public']['Tables']['user_profiles']['Row']

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const mountedRef = useRef(true)
  const router = useRouter()

  const fetchProfile = useCallback(async (userId: string, supabase: any) => {
    if (!mountedRef.current) return null
    
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (profileError) {
        console.error('Error fetching user profile:', profileError)
        return null
      }
      
      return profile
    } catch (error) {
      console.error('Profile fetch error:', error)
      return null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let subscription: any = null
    
    const initializeAuth = async () => {
      const supabase = createClient()
      
      if (!supabase) {
        console.warn('Supabase client not available')
        if (mountedRef.current) {
          setLoading(false)
          setInitialized(true)
        }
        return
      }

      try {
        // Get initial session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
        }

        if (!mountedRef.current) return

        const currentUser = session?.user ?? null
        setUser(currentUser)

        // Fetch profile if user exists
        if (currentUser) {
          const profile = await fetchProfile(currentUser.id, supabase)
          if (mountedRef.current) {
            setProfile(profile)
          }
        } else {
          setProfile(null)
        }

        // Set up auth state listener
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!mountedRef.current) return
            
            console.log('Auth state changed:', event, !!session?.user)
            
            const newUser = session?.user ?? null
            setUser(newUser)
            
            if (newUser) {
              const profile = await fetchProfile(newUser.id, supabase)
              if (mountedRef.current) {
                setProfile(profile)
              }
            } else {
              if (mountedRef.current) {
                setProfile(null)
              }
            }
          }
        )

        subscription = authSubscription

      } catch (error) {
        console.error('Auth initialization error:', error)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
          setInitialized(true)
        }
      }
    }

    initializeAuth()

    return () => {
      mountedRef.current = false
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    if (supabase) {
      try {
        await supabase.auth.signOut()
        // State will be updated by the auth state change listener
        // Redirect to hero page after sign out
        router.push('/')
      } catch (error) {
        console.error('Sign out error:', error)
        // Force local state update on error
        setUser(null)
        setProfile(null)
        // Still redirect even on error
        router.push('/')
      }
    } else {
      // Force local state update if no client
      setUser(null)
      setProfile(null)
      // Redirect to hero page
      router.push('/')
    }
  }, [router])

  return {
    user,
    profile,
    loading: loading || !initialized,
    signOut,
    isAuthenticated: !!user,
    isSuperAdmin: profile?.role === 'super_admin',
    isDistrictManager: profile?.role === 'district_manager',
    isLocationManager: profile?.role === 'location_manager',
  }
}