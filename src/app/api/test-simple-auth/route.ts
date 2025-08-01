import { NextRequest, NextResponse } from 'next/server'
import { simpleAuth } from '@/lib/simple-auth'

export async function GET(request: NextRequest) {
  try {
    console.log('TEST SIMPLE AUTH - Starting request')
    
    const { profile, error } = await simpleAuth(request)
    
    console.log('TEST SIMPLE AUTH - Result:', { 
      hasProfile: !!profile, 
      error 
    })

    return NextResponse.json({
      success: !error,
      profile: profile ? { 
        id: profile.id, 
        role: profile.role, 
        organization_id: profile.organization_id,
        email: profile.email
      } : null,
      error,
      step: 'simple_auth_test'
    })

  } catch (error) {
    console.error('TEST SIMPLE AUTH - Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      step: 'catch_block'
    }, { status: 500 })
  }
}