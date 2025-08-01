import { NextRequest, NextResponse } from 'next/server'
import { validateUserAuth } from '@/lib/auth-helper'

export async function GET(request: NextRequest) {
  try {
    console.log('TEST NEW AUTH - Starting request')
    
    const { user, profile, error } = await validateUserAuth(request)
    
    console.log('TEST NEW AUTH - Result:', { 
      hasUser: !!user, 
      hasProfile: !!profile, 
      error 
    })

    return NextResponse.json({
      success: !error,
      user: user ? { id: user.id, email: user.email } : null,
      profile: profile ? { 
        id: profile.id, 
        role: profile.role, 
        organization_id: profile.organization_id 
      } : null,
      error,
      step: 'auth_helper_test'
    })

  } catch (error) {
    console.error('TEST NEW AUTH - Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      step: 'catch_block'
    }, { status: 500 })
  }
}