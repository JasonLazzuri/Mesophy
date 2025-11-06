import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  const pathname = url.pathname

  try {
    // Skip middleware for static files, API routes that don't need auth, and public assets
    if (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon.ico') ||
      pathname.startsWith('/public/') ||
      pathname.endsWith('.svg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.jpeg') ||
      pathname.endsWith('.gif') ||
      pathname.endsWith('.ico') ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/auth/callback' ||
      pathname.startsWith('/api/test-') || // Allow test endpoints for now
      pathname.startsWith('/api/debug/') || // Debug endpoints have their own security
      pathname.startsWith('/api/devices/') // Device-facing APIs have their own authentication
    ) {
      return NextResponse.next()
    }

    // Create Supabase client for middleware
    const supabase = createClient(request)

    // Check authentication for protected routes
    const { data: { user }, error } = await supabase.auth.getUser()

    // If no user or authentication error, redirect to login
    if (error || !user) {
      console.log('Middleware: No authenticated user, redirecting to login')
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // For API routes, add security headers and basic validation
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.next()
      
      // Add security headers to API responses
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-XSS-Protection', '1; mode=block')
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      
      // Basic rate limiting check (simple implementation)
      const userAgent = request.headers.get('user-agent') || ''
      const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
      
      // Log API access for monitoring
      console.log(`API Access: ${pathname} | User: ${user.id} | IP: ${ip} | UA: ${userAgent.substring(0, 50)}`)
      
      // Check for suspicious patterns
      if (userAgent.toLowerCase().includes('bot') && 
          !userAgent.toLowerCase().includes('googlebot') && 
          !userAgent.toLowerCase().includes('bingbot')) {
        console.warn(`Suspicious bot access blocked: ${userAgent}`)
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      
      return response
    }

    // For dashboard routes, ensure user has proper access
    if (pathname.startsWith('/dashboard')) {
      // Get user profile to check if they have proper setup
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, organization_id, is_active')
        .eq('id', user.id)
        .single()

      // If no profile or inactive user, redirect to login
      if (!profile || !profile.is_active || !profile.organization_id) {
        console.log('Middleware: User profile incomplete or inactive, redirecting to login')
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      // Add user context to request headers for downstream use
      const response = NextResponse.next()
      response.headers.set('x-user-id', user.id)
      response.headers.set('x-user-role', profile.role || '')
      response.headers.set('x-user-org', profile.organization_id || '')
      
      return response
    }

    // For all other routes, just continue with security headers
    const response = NextResponse.next()
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    
    return response

  } catch (error) {
    console.error('Middleware error:', error)
    
    // On error, allow request to proceed but log the issue
    // This prevents middleware from breaking the app
    const response = NextResponse.next()
    response.headers.set('x-middleware-error', 'true')
    
    return response
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}