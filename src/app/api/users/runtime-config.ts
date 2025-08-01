// Environment variable access with Vercel-specific workarounds
export function getServiceKey() {
  // Try the standard approach first
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (key) {
    console.log('Service key found via SUPABASE_SERVICE_ROLE_KEY')
    return key
  }
  
  // Try dynamic access (sometimes works when direct doesn't)
  key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (key) {
    console.log('Service key found via dynamic access')
    return key
  }
  
  // Try with NEXT_PUBLIC prefix (Vercel workaround)
  key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
  if (key) {
    console.log('Service key found via NEXT_PUBLIC_SUPABASE_SERVICE_KEY')
    return key
  }
  
  console.error('Service key not found in any variant')
  console.error('Available SUPABASE env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
  console.error('Total env vars:', Object.keys(process.env).length)
  console.error('Vercel env check:', {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_URL: process.env.VERCEL_URL
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