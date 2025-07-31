import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

// Admin client for server-side admin operations
export const createAdminClient = cache(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Try different possible env var names for the service key
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                   process.env.SUPABASE_SERVICE_KEY ||
                   process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
                   process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY

  console.log('Admin client env check:', {
    url: url ? 'present' : 'missing',
    serviceKey: serviceKey ? `present (${serviceKey.substring(0, 10)}...)` : 'missing',
    allEnvKeys: Object.keys(process.env).filter(key => key.includes('SUPABASE')),
    checkedVariants: {
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_SERVICE_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
    }
  })

  // TEMPORARY WORKAROUND: If no env var found, provide instructions for manual entry
  if (!serviceKey) {
    console.error('No Supabase service key found in environment variables')
    console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
    console.error('Process env NODE_ENV:', process.env.NODE_ENV)
    console.error('Process env VERCEL_ENV:', process.env.VERCEL_ENV)
    
    // Let's try accessing it directly from process.env with a different approach
    if (typeof window === 'undefined') {  // Server-side only
      const dynamicKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || 
                         process.env['NEXT_PUBLIC_SUPABASE_SERVICE_KEY']
      if (dynamicKey) {
        console.log('Found service key using dynamic access')
        serviceKey = dynamicKey
      }
    }
    
    if (!serviceKey) {
      console.error('Still no service key found. Please check Vercel environment variable configuration.')
      return null
    }
  }

  if (!url || !serviceKey) {
    console.error('Supabase admin environment variables not found', {
      url: !!url,
      serviceKey: !!serviceKey
    })
    return null
  }

  try {
    const client = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    console.log('Admin client created successfully')
    return client
  } catch (error) {
    console.error('Failed to create admin client:', error)
    return null
  }
})