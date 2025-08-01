import { NextResponse } from 'next/server'

export async function GET() {
  // Use the working service key access pattern
  const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || 
                     process.env.SUPABASE_SERVICE_ROLE_KEY ||
                     process.env.SUPABASE_SERVICE_KEY ||
                     process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  
  const envInfo = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
    supabaseServiceKey: serviceKey ? 'present' : 'missing',
    
    // Detailed debugging for the specific variable
    serviceKeyDebugging: {
      finalServiceKey: serviceKey ? `present (${serviceKey.substring(0, 10)}...)` : 'missing',
      accessPattern: serviceKey === process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ? 'NEXT_PUBLIC_SUPABASE_SERVICE_KEY' :
                     serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' :
                     serviceKey === process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY' :
                     serviceKey === process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY' : 'none'
    },
    
    serviceKeyVariants: {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'present' : 'missing',
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
      NEXT_PUBLIC_SUPABASE_SERVICE_KEY: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ? 'present' : 'missing',
    },
    allSupabaseKeys: Object.keys(process.env).filter(key => key.includes('SUPABASE')),
    allEnvKeys: Object.keys(process.env).length,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    
    // Check if this is a build vs runtime issue
    buildTime: !process.env.VERCEL_URL ? 'likely-build-time' : 'runtime',
    
    // Force refresh timestamp
    timestamp: new Date().toISOString(),
    deployment: 'force-refresh-v2'
  }

  return NextResponse.json(envInfo)
}