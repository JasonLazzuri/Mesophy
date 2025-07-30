'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Database } from '@/types/database'

type UserProfile = Database['public']['Tables']['user_profiles']['Row']

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    
    if (!supabase) {
      setLoading(false)
      return
    }

    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!mounted) return
        
        setUser(user)

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single()
          
          if (profileError) {
            console.error('Error fetching user profile:', profileError)
          } else {
            console.log('Successfully fetched user profile:', profile)
          }
          
          if (mounted) {
            setProfile(profile)
          }
        }
      } catch (error) {
        console.error('Auth error:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        
        setUser(session?.user ?? null)
        
        if (session?.user) {
          try {
            const { data: profile, error: profileError } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            
            if (profileError) {
              console.error('Error fetching user profile in auth change:', profileError)
            } else {
              console.log('Successfully fetched user profile in auth change:', profile)
            }
            
            if (mounted) {
              setProfile(profile)
            }
          } catch (error) {
            console.error('Profile fetch error:', error)
          }
        } else {
          setProfile(null)
        }
        
        if (mounted) {
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // Empty dependency array - only run once

  const signOut = async () => {
    const supabase = createClient()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setProfile(null)
  }

  return {
    user,
    profile,
    loading,
    signOut,
    isAuthenticated: !!user,
    isSuperAdmin: profile?.role === 'super_admin',
    isDistrictManager: profile?.role === 'district_manager',
    isLocationManager: profile?.role === 'location_manager',
  }
}