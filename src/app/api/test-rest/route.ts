import { NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('=== TESTING SUPABASE REST API DIRECTLY ===')
    
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
    
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
    }
    
    console.log('Testing direct REST API call to list users...')
    
    // Test direct REST API call to Supabase admin endpoint
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json'
      }
    })
    
    console.log('REST API response status:', response.status)
    console.log('REST API response headers:', Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('REST API error:', errorText)
      return NextResponse.json({
        error: 'REST API failed',
        status: response.status,
        statusText: response.statusText,
        body: errorText
      }, { status: 500 })
    }
    
    const data = await response.json()
    console.log('REST API success! User count:', data.users?.length || 0)
    
    return NextResponse.json({
      success: true,
      method: 'direct_rest_api',
      userCount: data.users?.length || 0,
      firstUser: data.users?.[0]?.email || 'none'
    })
    
  } catch (error) {
    console.error('REST API test error:', error)
    return NextResponse.json({
      error: error.message,
      type: typeof error
    }, { status: 500 })
  }
}