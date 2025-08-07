import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Fetch the install script from GitHub
    const response = await fetch('https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client/install.sh')
    
    if (!response.ok) {
      throw new Error('Failed to fetch installer script')
    }
    
    const scriptContent = await response.text()
    
    // Return as downloadable file
    return new NextResponse(scriptContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sh',
        'Content-Disposition': 'attachment; filename="mesophy-pi-installer.sh"',
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