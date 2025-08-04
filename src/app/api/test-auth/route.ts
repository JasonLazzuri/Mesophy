import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Only allow access in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 404 })
    }

    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database unavailable',
        details: 'Supabase client initialization failed'
      }, { status: 503 })
    }

    // Test auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    return NextResponse.json({
      success: true,
      authStatus: {
        hasUser: !!user,
        userId: user?.id,
        email: user?.email,
        authError: authError?.message
      },
      cookies: {
        present: request.headers.get('cookie') ? 'yes' : 'no',
        cookieHeader: request.headers.get('cookie')?.substring(0, 100) + '...'
      }
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    }, { status: 500 })
  }
}