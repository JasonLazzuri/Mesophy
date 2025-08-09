import { NextResponse } from 'next/server'

export async function GET() {
  const env = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey1: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY,
    hasServiceKey2: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasServiceKey3: !!process.env.SUPABASE_SERVICE_KEY,
    hasServiceKey4: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  }
  
  return NextResponse.json(env)
}