import { NextRequest } from 'next/server'

interface AuthUser {
  id: string
  email: string
  user_metadata?: {
    full_name?: string
    role?: string
    organization_id?: string
  }
}

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
  user: AuthUser | null
  profile: UserProfile | null
  error: string | null
}

/**
 * Validate user authentication using direct REST API calls to bypass
 * Supabase JavaScript client issues in serverless environment
 */
export async function validateUserAuth(request: NextRequest): Promise<AuthResult> {
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
    // Extract auth token from cookies
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
      return {
        user: null,
        profile: null,
        error: 'No authentication cookies found'
      }
    }

    // Parse the Supabase auth token from cookies
    const authTokenMatch = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)
    if (!authTokenMatch) {
      return {
        user: null,
        profile: null,
        error: 'No Supabase auth token found in cookies'
      }
    }

    let authToken: string
    try {
      // The token is base64 encoded
      const encodedToken = authTokenMatch[1]
      if (encodedToken.startsWith('base64-')) {
        authToken = encodedToken.substring(7) // Remove 'base64-' prefix
      } else {
        authToken = encodedToken
      }
      
      // Decode the JWT token
      const tokenData = JSON.parse(Buffer.from(authToken, 'base64').toString())
      const accessToken = tokenData.access_token
      
      if (!accessToken) {
        return {
          user: null,
          profile: null,
          error: 'No access token found in auth cookie'
        }
      }

      // Validate the token with Supabase REST API
      const userResponse = await fetch(`${url}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': anonKey,
          'Content-Type': 'application/json'
        }
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        return {
          user: null,
          profile: null,
          error: `Authentication failed: ${userResponse.status} ${errorText}`
        }
      }

      const user: AuthUser = await userResponse.json()

      // Get user profile from database using the same access token
      const profileResponse = await fetch(`${url}/rest/v1/user_profiles?id=eq.${user.id}&select=*`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text()
        return {
          user,
          profile: null,
          error: `Profile fetch failed: ${profileResponse.status} ${errorText}`
        }
      }

      const profiles: UserProfile[] = await profileResponse.json()
      const profile = profiles[0] || null

      if (!profile) {
        return {
          user,
          profile: null,
          error: 'User profile not found'
        }
      }

      return {
        user,
        profile,
        error: null
      }

    } catch (tokenError) {
      return {
        user: null,
        profile: null,
        error: `Token parsing failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`
      }
    }

  } catch (error) {
    return {
      user: null,
      profile: null,
      error: `Authentication validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Helper function to check if user has required role
 */
export function hasRequiredRole(profile: UserProfile | null, allowedRoles: string[]): boolean {
  if (!profile) return false
  return allowedRoles.includes(profile.role)
}

/**
 * Helper function to check organization access
 */
export function hasOrganizationAccess(profile: UserProfile | null, requiredOrgId?: string): boolean {
  if (!profile || !profile.organization_id) return false
  if (requiredOrgId && profile.organization_id !== requiredOrgId) return false
  return true
}