import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Helper function to get service key
function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 
         process.env.SUPABASE_SERVICE_KEY ||
         process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
         process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
}

export async function GET() {
  try {
    console.log('Testing admin client creation...')
    
    // Test service key access
    const serviceKey = getServiceKey()
    console.log('Service key test:', serviceKey ? `present (${serviceKey.substring(0, 10)}...)` : 'missing')
    
    // Test standard admin client
    const adminClient = createAdminClient()
    console.log('Standard admin client:', adminClient ? 'success' : 'failed')
    
    // Test manual admin client creation
    let manualClient = null
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
        manualClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        })
        console.log('Manual admin client: success')
        
        // Test actual admin operation
        const testResult = await manualClient.auth.admin.listUsers()
        console.log('Admin operation test:', testResult.error ? `failed: ${testResult.error.message}` : 'success')
        
        return NextResponse.json({
          serviceKey: serviceKey ? 'present' : 'missing',
          standardClient: adminClient ? 'success' : 'failed',
          manualClient: manualClient ? 'success' : 'failed',
          adminOperation: testResult.error ? `failed: ${testResult.error.message}` : 'success',
          userCount: testResult.data?.users?.length || 0
        })
        
      } catch (error) {
        console.error('Manual client creation failed:', error)
        return NextResponse.json({
          serviceKey: serviceKey ? 'present' : 'missing',
          standardClient: adminClient ? 'success' : 'failed',
          manualClient: 'failed',
          error: error.message
        }, { status: 500 })
      }
    }
    
    return NextResponse.json({
      serviceKey: serviceKey ? 'present' : 'missing',
      standardClient: adminClient ? 'success' : 'failed',
      manualClient: 'not attempted',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing'
    })
    
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}