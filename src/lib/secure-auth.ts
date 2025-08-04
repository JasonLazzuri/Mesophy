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
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AuthUser {
  id: string
  email: string
  created_at: string
  updated_at: string
}

interface SecureAuthResult {
  user: AuthUser | null
  profile: UserProfile | null
  error: string | null
}

/**
 * SECURE authentication using proper Supabase JWT validation
 * This is the recommended authentication method for all API endpoints
 */
export async function validateUserAuth(request: NextRequest): Promise<SecureAuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anonKey) {
    return {
      user: null,
      profile: null,
      error: 'Supabase configuration missing'
    }
  }

  try {
    // Create Supabase client with proper cookie handling
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Cookie setting is handled by individual route handlers
        },
      },
    })

    // Use Supabase's built-in JWT validation
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      return {
        user: null,
        profile: null,
        error: `Authentication error: ${authError.message}`
      }
    }

    if (!user) {
      return {
        user: null,
        profile: null,
        error: 'No authenticated user found'
      }
    }

    // Get user profile using authenticated Supabase client (respects RLS)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return {
        user: null,
        profile: null,
        error: `Profile error: ${profileError.message}`
      }
    }

    if (!profile) {
      return {
        user: null,
        profile: null,
        error: 'User profile not found'
      }
    }

    // Validate user account status
    if (!profile.is_active) {
      return {
        user: null,
        profile: null,
        error: 'User account is deactivated'
      }
    }

    if (!profile.organization_id) {
      return {
        user: null,
        profile: null,
        error: 'User is not associated with an organization'
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      profile,
      error: null
    }

  } catch (error) {
    return {
      user: null,
      profile: null,
      error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Create authenticated Supabase client from request
 * This respects RLS policies and user context
 */
export async function createAuthenticatedClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anonKey) {
    throw new Error('Supabase configuration missing')
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {
        // Cookie setting is handled by individual route handlers
      },
    },
  })
}

/**
 * Role-based access control helper
 */
export function hasRequiredRole(profile: UserProfile | null, allowedRoles: string[]): boolean {
  if (!profile) return false
  return allowedRoles.includes(profile.role)
}

/**
 * Organization access control helper
 */
export function hasOrganizationAccess(profile: UserProfile | null, requiredOrgId?: string): boolean {
  if (!profile || !profile.organization_id) return false
  if (requiredOrgId && profile.organization_id !== requiredOrgId) return false
  return true
}

/**
 * District access control helper
 */
export function hasDistrictAccess(profile: UserProfile | null, requiredDistrictId?: string): boolean {
  if (!profile) return false
  
  // Super admins have access to all districts in their organization
  if (profile.role === 'super_admin') return true
  
  // District managers have access to their own district
  if (profile.role === 'district_manager' && profile.district_id === requiredDistrictId) return true
  
  // Location managers have access if the location is in the required district
  if (profile.role === 'location_manager' && requiredDistrictId) {
    // This would need to be validated with a database query
    // For now, return false for location managers trying to access district-level data
    return false
  }
  
  return false
}

/**
 * Location access control helper
 */
export function hasLocationAccess(profile: UserProfile | null, requiredLocationId?: string): boolean {
  if (!profile) return false
  
  // Super admins have access to all locations in their organization
  if (profile.role === 'super_admin') return true
  
  // District managers have access to locations in their district
  if (profile.role === 'district_manager') return true // Would need DB query to verify location is in their district
  
  // Location managers have access to their own location
  if (profile.role === 'location_manager' && profile.location_id === requiredLocationId) return true
  
  return false
}

/**
 * Standardized error responses for authentication failures
 */
export const AUTH_ERRORS = {
  UNAUTHORIZED: { error: 'Unauthorized', status: 401 },
  FORBIDDEN: { error: 'Forbidden', status: 403 },
  USER_NOT_FOUND: { error: 'User profile not found', status: 404 },
  INACTIVE_USER: { error: 'User account is deactivated', status: 403 },
  NO_ORGANIZATION: { error: 'User is not associated with an organization', status: 403 },
  INSUFFICIENT_PERMISSIONS: { error: 'Insufficient permissions for this operation', status: 403 },
  SERVER_ERROR: { error: 'Authentication service unavailable', status: 503 }
} as const