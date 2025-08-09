import { NextRequest, NextResponse } from 'next/server'

/**
 * Simplified current-content endpoint to test basic functionality
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const screen_id = params.id
    console.log('Simple current-content API called for screen:', screen_id)

    // Return a basic "no content" response for now
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() // monday, tuesday, etc.

    return NextResponse.json({
      message: 'No content scheduled for current time',
      screen_id,
      current_time: currentTime,
      current_day: currentDay,
      debug: 'Simple endpoint working'
    })

  } catch (error) {
    console.error('Error in simple current-content:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    )
  }
}