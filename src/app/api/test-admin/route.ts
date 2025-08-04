import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Only allow access in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 404 })
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

    console.log('=== ADMIN CLIENT TEST START (AUTHORIZED) ===')
    
    // Safe admin client test (no sensitive data exposed)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
    
    console.log('Environment check:', {
      url: url ? 'configured' : 'missing',
      serviceKey: serviceKey ? 'configured' : 'missing'
    })
    
    if (!url || !serviceKey) {
      return NextResponse.json({ 
        error: 'Missing environment variables',
        url: !!url,
        serviceKey: !!serviceKey
      }, { status: 500 })
    }
    
    // Create admin client
    console.log('Creating admin client...')
    const adminClient = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    console.log('Admin client created:', !!adminClient)
    console.log('Admin client has auth:', !!adminClient.auth)
    console.log('Admin client has auth.admin:', !!adminClient.auth.admin)
    console.log('Admin client auth.admin methods:', Object.keys(adminClient.auth.admin || {}))
    
    // Test specific method
    const hasGetUserByEmail = typeof adminClient.auth.admin.getUserByEmail === 'function'
    console.log('Has getUserByEmail method:', hasGetUserByEmail)
    
    if (!hasGetUserByEmail) {
      return NextResponse.json({
        error: 'Missing getUserByEmail method',
        authExists: !!adminClient.auth,
        adminExists: !!adminClient.auth.admin,
        adminMethods: Object.keys(adminClient.auth.admin || {}),
        authType: typeof adminClient.auth,
        adminType: typeof adminClient.auth.admin
      }, { status: 500 })
    }
    
    // Try the actual call
    console.log('Testing getUserByEmail...')
    const result = await adminClient.auth.admin.getUserByEmail('test@example.com')
    console.log('getUserByEmail result:', result.error ? `Error: ${result.error.message}` : 'Success')
    
    return NextResponse.json({
      success: true,
      hasAdminClient: true,
      hasAuthAdmin: true,
      hasGetUserByEmail: true,
      testResult: result.error ? result.error.message : 'User not found (expected)'
    })
    
  } catch (error) {
    console.error('Test error:', error)
    return NextResponse.json({
      error: error.message,
      name: error.name,
      stack: error.stack,
      type: typeof error
    }, { status: 500 })
  }
}