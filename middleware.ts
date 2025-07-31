// TEMPORARILY DISABLED MIDDLEWARE
// This middleware is completely disabled to prevent any interference with authentication flows
// All authentication is now handled client-side via ProtectedRoute components

import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Completely bypass all middleware logic
  // Just pass through all requests without any processing
  return NextResponse.next()
}

// Disable matcher to prevent middleware from running on any routes
export const config = {
  matcher: [],
}