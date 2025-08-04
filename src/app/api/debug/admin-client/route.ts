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

    // Safe debug information (no sensitive data exposed)
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      supabaseConnection: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
        client: supabase ? 'connected' : 'failed'
      },
      authentication: {
        user: user ? 'authenticated' : 'not authenticated',
        profile: profile ? 'loaded' : 'not loaded',
        role: profile?.role || 'unknown'
      },
      warnings: []
    }

    // Check for common configuration issues (safe to expose)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http')) {
      debugInfo.warnings.push('Supabase URL may be invalid')
    }

    return NextResponse.json(debugInfo)
    
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}