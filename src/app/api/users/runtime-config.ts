// Simplified environment variable access
export function getServiceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
  
  if (key) {
    console.log('Service key found')
    return key
  }
  
  console.error('Service key not found in environment variables')
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