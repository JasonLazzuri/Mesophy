import { createBrowserClient } from '@supabase/ssr'

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null

export const createClient = () => {
  // Return existing instance if available (singleton pattern for browser)
  if (supabaseInstance) {
    return supabaseInstance
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // During build time or when env vars are missing, return null instead of throwing
    console.warn('Supabase environment variables not found')
    return null
  }

  // Only create client in browser environment
  if (typeof window !== 'undefined') {
    supabaseInstance = createBrowserClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    return supabaseInstance
  }

  return null
}