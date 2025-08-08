import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Try to fetch the new native installer from GitHub first
    let response = await fetch('https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client/install-native.sh')
    
    // Fallback to the old installer if native version not available
    if (!response.ok) {
      console.log('Native installer not found, falling back to original installer')
      response = await fetch('https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client/install.sh')
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch installer script')
    }
    
    const scriptContent = await response.text()
    
    // Return as downloadable file
    return new NextResponse(scriptContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sh',
        'Content-Disposition': 'attachment; filename="mesophy-pi-native-installer.sh"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('Error fetching installer:', error)
    return NextResponse.json(
      { error: 'Failed to download installer script' }, 
      { status: 500 }
    )
  }
}