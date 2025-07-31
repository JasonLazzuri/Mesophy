import { NextResponse } from 'next/server'

export async function GET() {
  const envInfo = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
    serviceKeyVariants: {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'present' : 'missing',
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
      NEXT_PUBLIC_SUPABASE_SERVICE_KEY: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ? 'present' : 'missing',
    },
    allSupabaseKeys: Object.keys(process.env).filter(key => key.includes('SUPABASE')),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  }

  return NextResponse.json(envInfo)
}