import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const env = {
      NODE_ENV: process.env.NODE_ENV,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      hasServiceKey1: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY,
      hasServiceKey2: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasServiceKey3: !!process.env.SUPABASE_SERVICE_KEY,
      hasServiceKey4: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
      serviceKey1Length: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY?.length || 0,
      serviceKey2Length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      serviceKey3Length: process.env.SUPABASE_SERVICE_KEY?.length || 0,
      serviceKey4Length: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    }
    
    return NextResponse.json(env)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}