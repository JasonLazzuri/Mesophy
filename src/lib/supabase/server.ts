import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export const createClient = cache(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return null during build time when env vars aren't available
    console.warn('Supabase environment variables not found on server')
    return null
  }

  try {
    const cookieStore = await cookies()

    return createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This is expected and can be ignored.
            console.debug('Cookie setting failed in Server Component:', error)
          }
        },
      },
    })
  } catch (error) {
    console.error('Failed to create server Supabase client:', error)
    return null
  }
})