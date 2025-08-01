import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    console.log('=== ADMIN CLIENT TEST START ===')
    
    // Get environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
    
    console.log('Environment check:', {
      url: url ? 'present' : 'missing',
      serviceKey: serviceKey ? `present (${serviceKey.substring(0, 20)}...)` : 'missing'
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