import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return a mock client during build time when env vars aren't available
    if (typeof window === 'undefined') {
      return null
    }
    throw new Error('Supabase URL and API Key are required')
  }

  return createBrowserClient(url, key)
}