import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface UserProfile {
  id: string
  full_name: string | null
  email: string
  role: string
  organization_id: string
  district_id: string | null
  location_id: string | null
  created_at: string
  updated_at: string
}

interface AuthResult {
  profile: UserProfile | null
  error: string | null
}

/**
 * SECURE authentication using proper JWT validation through Supabase
 * This replaces the insecure simple-auth bypass mechanism
 */
export async function validateAuth(request: NextRequest): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anonKey) {
    return {
      profile: null,
      error: 'Supabase configuration missing'
    }
  }

  try {
    // Create Supabase client for proper authentication
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Cookie setting is handled elsewhere
        },
      },
    })

    // Authenticate using proper JWT validation
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        profile: null,
        error: authError?.message || 'No authenticated user found'
      }
    }

    // Get user profile with proper authentication context
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return {
        profile: null,
        error: profileError?.message || 'User profile not found'
      }
    }

    // Verify user is active and properly configured
    if (!profile.is_active) {
      return {
        profile: null,
        error: 'User account is deactivated'
      }
    }

    if (!profile.organization_id) {
      return {
        profile: null,
        error: 'User is not associated with an organization'
      }
    }

    return {
      profile,
      error: null
    }

  } catch (error) {
    return {
      profile: null,
      error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * DEPRECATED: Use validateAuth instead
 * This function is kept for backward compatibility but should not be used
 */
export async function simpleAuth(request: NextRequest): Promise<AuthResult> {
  console.warn('⚠️  simpleAuth is deprecated and insecure. Use validateAuth instead.')
  return validateAuth(request)
}

/**
 * Check if user has required role
 */
export function hasRequiredRole(profile: UserProfile | null, allowedRoles: string[]): boolean {
  if (!profile) return false
  return allowedRoles.includes(profile.role)
}

/**
 * Check organization access
 */
export function hasOrganizationAccess(profile: UserProfile | null): boolean {
  if (!profile || !profile.organization_id) return false
  return true
}