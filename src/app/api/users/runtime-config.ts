// Try to access environment variables using different methods
export function getServiceKey() {
  // Method 1: Direct access
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) {
    console.log('Service key found via SUPABASE_SERVICE_ROLE_KEY')
    return key
  }

  // Method 2: Next.js public prefix (TEMPORARY WORKAROUND)
  key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
  if (key) {
    console.log('Service key found via NEXT_PUBLIC_SUPABASE_SERVICE_KEY')
    return key
  }

  // Method 3: Dynamic access
  key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (key) {
    console.log('Service key found via dynamic access')
    return key
  }

  // Method 4: Try different naming
  key = process.env.SUPABASE_SERVICE_KEY
  if (key) {
    console.log('Service key found via SUPABASE_SERVICE_KEY')
    return key
  }

  // Method 5: Alternative public naming
  key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  if (key) {
    console.log('Service key found via NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')
    return key
  }

  console.error('Service key not found in any variant:', {
    available: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    totalEnvVars: Object.keys(process.env).length,
    checkedKeys: [
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_SERVICE_KEY',
      'SUPABASE_SERVICE_KEY',
      'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'
    ].map(k => ({ key: k, found: !!process.env[k] }))
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