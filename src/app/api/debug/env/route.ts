import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Only allow access in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Debug endpoints disabled in production' }, { status: 404 })
    }

    // SECURITY: Require authentication
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Require super_admin role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    // Safe environment information (no sensitive data exposed)
    const safeEnvInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      platform: {
        node: process.version,
        isVercel: !!process.env.VERCEL,
        isProduction: process.env.NODE_ENV === 'production'
      },
      configuration: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'configured' : 'missing',
        // Never expose actual keys or partial keys in any environment
        hasServiceKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
        totalEnvVars: Object.keys(process.env).length,
        supabaseVarCount: Object.keys(process.env).filter(key => key.includes('SUPABASE')).length
      },
      warnings: []
    }

    // Add configuration warnings (safe to expose)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      safeEnvInfo.warnings.push('Supabase URL not configured')
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      safeEnvInfo.warnings.push('Supabase anonymous key not configured')
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
      safeEnvInfo.warnings.push('Service role key not configured')
    }

    return NextResponse.json(safeEnvInfo)
    
  } catch (error) {
    console.error('Debug env endpoint error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}