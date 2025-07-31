import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // During build time, just continue without auth check
    return supabaseResponse
  }

  // Skip auth check for static files, API routes, and public assets
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.startsWith('/favicon') ||
    request.nextUrl.pathname.match(/\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot)$/)
  ) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    // Attempt to refresh the session first
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession()

    let user = session?.user || null

    // If no session, try to get user directly
    if (!session) {
      const {
        data: { user: directUser },
        error: userError
      } = await supabase.auth.getUser()
      
      user = directUser
      
      // If both session and direct user fetch fail, log and continue
      if (userError && sessionError) {
        console.error('Auth errors in middleware:', { sessionError, userError })
        return supabaseResponse
      }
    }

    // Redirect to login if not authenticated and not already on auth pages
    if (
      !user &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/signup') &&
      !request.nextUrl.pathname.startsWith('/auth') &&
      request.nextUrl.pathname !== '/'
    ) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      return NextResponse.redirect(redirectUrl)
    }

    // Redirect authenticated users away from auth pages
    if (
      user &&
      (request.nextUrl.pathname.startsWith('/login') ||
       request.nextUrl.pathname.startsWith('/signup'))
    ) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/dashboard'
      return NextResponse.redirect(redirectUrl)
    }

    return supabaseResponse
  } catch (error) {
    console.error('Middleware error:', error)
    // On error, allow the request to continue to prevent breaking the app
    return supabaseResponse
  }
}