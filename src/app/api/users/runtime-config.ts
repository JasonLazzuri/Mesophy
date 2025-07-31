// Try to access environment variables using different methods
export function getServiceKey() {
  // Method 1: Direct access
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) return key

  // Method 2: Next.js public prefix
  key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
  if (key) return key

  // Method 3: Dynamic access
  key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (key) return key

  // Method 4: Try different naming
  key = process.env.SUPABASE_SERVICE_KEY
  if (key) return key

  console.error('Service key not found in any variant:', {
    available: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
  })

  return null
}

export function debugEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    allKeys: Object.keys(process.env).length,
    supabaseKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    hasServiceKey: !!getServiceKey()
  }
}