export default function PiInstallerPage() {
  return (
    <html>
      <head>
        <title>Mesophy Pi Installer Download</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{
          __html: `
            body {
              margin: 0;
              padding: 40px 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              max-width: 600px;
              text-align: center;
              background: rgba(255, 255, 255, 0.1);
              padding: 40px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
            }
            h1 {
              font-size: 2.5rem;
              margin-bottom: 1rem;
              font-weight: 700;
            }
            .subtitle {
              font-size: 1.2rem;
              margin-bottom: 2rem;
              opacity: 0.9;
            }
            .download-btn {
              display: inline-block;
              background: #10b981;
              color: white;
              padding: 16px 32px;
              text-decoration: none;
              border-radius: 12px;
              font-size: 1.1rem;
              font-weight: 600;
              margin: 20px 10px;
              transition: all 0.3s ease;
              box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
            }
            .download-btn:hover {
              background: #059669;
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
            }
            .instructions {
              margin-top: 2rem;
              padding: 20px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 12px;
              text-align: left;
            }
            .instructions h3 {
              margin-top: 0;
              margin-bottom: 1rem;
            }
            .instructions ol {
              line-height: 1.6;
            }
            .instructions li {
              margin-bottom: 0.5rem;
            }
            .code {
              background: rgba(0, 0, 0, 0.3);
              padding: 12px;
              border-radius: 8px;
              font-family: 'Courier New', monospace;
              margin: 10px 0;
              word-break: break-all;
            }
            .warning {
              background: rgba(245, 158, 11, 0.2);
              border: 1px solid rgba(245, 158, 11, 0.3);
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .dashboard-link {
              display: inline-block;
              background: rgba(255, 255, 255, 0.2);
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 8px;
              margin: 10px;
              border: 1px solid rgba(255, 255, 255, 0.3);
            }
            .dashboard-link:hover {
              background: rgba(255, 255, 255, 0.3);
            }
          `
        }} />
      </head>
      <body>
        <div className="container">
          <h1>🎬 Mesophy Pi Native Client</h1>
          <p className="subtitle">
            Professional digital signage with native media players - no browser required!
          </p>

          <div>
            <a 
              href="/api/devices/installer" 
              className="download-btn"
              download="mesophy-pi-native-installer.sh"
            >
              📥 Download Native Installer
            </a>
            <a 
              href="/dashboard" 
              className="dashboard-link"
            >
              🏠 Go to Dashboard
            </a>
          </div>

          <div className="instructions">
            <h3>📋 Installation Instructions</h3>
            <ol>
              <li>Download the native installer script above</li>
              <li>Transfer to your Raspberry Pi (USB, SCP, etc.)</li>
              <li>Make it executable:</li>
              <div className="code">chmod +x mesophy-pi-native-installer.sh</div>
              <li>Run the installer:</li>
              <div className="code">sudo ./mesophy-pi-native-installer.sh</div>
              <li>Connect HDMI display - pairing code will appear automatically</li>
              <li>Use the dashboard to pair the device to a screen</li>
            </ol>
          </div>

          <div className="warning">
            <strong>⚠️ Requirements:</strong>
            <ul style={{margin: '10px 0', paddingLeft: '20px'}}>
              <li>Raspberry Pi 3B+ or newer (Pi 4 recommended)</li>
              <li>16GB+ microSD card (Class 10+)</li>
              <li>Internet connection (WiFi or Ethernet)</li>
              <li>HDMI display (TV or monitor)</li>
            </ul>
          </div>

          <div className="instructions">
            <h3>🔗 One-Line Install (Recommended)</h3>
            <p>Or run directly on your Pi terminal:</p>
            <div className="code">
              curl -sSL https://mesophy.vercel.app/api/devices/installer | sudo bash
            </div>
            <p><strong>✨ New Features:</strong></p>
            <ul style={{margin: '10px 0', paddingLeft: '20px', color: '#10b981'}}>
              <li>🎬 Native media players (no browser required)</li>
              <li>🖥️ Automatic display configuration</li>
              <li>⚡ Hardware-accelerated video playback</li>
              <li>🔄 Auto-boot and self-healing system</li>
              <li>📱 QR code pairing support</li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  )
}