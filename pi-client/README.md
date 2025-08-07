# Mesophy Pi Client

Digital signage client application for Raspberry Pi devices.

## Quick Installation

```bash
curl -sSL https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client/install.sh | sudo bash
```

## Manual Installation

1. **Prerequisites**
   ```bash
   sudo apt update
   sudo apt install -y curl git sqlite3 chromium-browser
   ```

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
   sudo apt install -y nodejs
   ```

3. **Download and Install Client**
   ```bash
   sudo mkdir -p /opt/mesophy
   cd /opt/mesophy
   sudo git clone https://github.com/JasonLazzuri/Mesophy.git client
   cd client/pi-client
   sudo npm install --production
   ```

4. **Create Configuration**
   ```bash
   sudo mkdir -p /opt/mesophy/config
   sudo cp config.example.json /opt/mesophy/config/config.json
   ```

5. **Install as Service**
   ```bash
   sudo cp mesophy-client.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable mesophy-client
   sudo systemctl start mesophy-client
   ```

## Device Pairing

1. **Start the Pi** - The client will automatically start and generate a pairing code
2. **View the pairing screen** - Open http://pi-ip-address:3000 in a browser or connect HDMI display
3. **Note the pairing code** - A 6-character code will be displayed (e.g., "ABC123")
4. **Pair through dashboard**:
   - Go to https://mesophy.vercel.app
   - Login to your account
   - Navigate to Screens → Pair Device
   - Enter the pairing code
   - Select the screen this Pi should control
5. **Pi will automatically sync** and start displaying content

## Configuration

Configuration file: `/opt/mesophy/config/config.json`

```json
{
  "api": {
    "baseUrl": "https://mesophy.vercel.app",
    "endpoints": {
      "generateCode": "/api/devices/generate-code",
      "checkPairing": "/api/devices/check-pairing",
      "sync": "/api/devices/sync",
      "heartbeat": "/api/devices/heartbeat"
    }
  },
  "device": {
    "syncInterval": 120,
    "heartbeatInterval": 300,
    "displayTimeout": 30000
  },
  "display": {
    "width": 1920,
    "height": 1080,
    "fullscreen": true
  }
}
```

## Service Management

```bash
# View logs
sudo journalctl -u mesophy-client -f

# Restart service
sudo systemctl restart mesophy-client

# Stop service
sudo systemctl stop mesophy-client

# Check status
sudo systemctl status mesophy-client
```

## Troubleshooting

### Pi won't generate pairing code
- Check internet connection: `ping google.com`
- Check service status: `sudo systemctl status mesophy-client`
- View logs: `sudo journalctl -u mesophy-client -n 50`

### Display issues
- Check HDMI connection
- Verify display resolution in config
- Check Chromium browser installation: `chromium-browser --version`

### Can't pair device
- Verify pairing code is correct (case-sensitive)
- Check if code has expired (15 minutes)
- Ensure Pi has internet access
- Try generating new code by restarting service

### Content not syncing
- Check device token in database
- Verify API connectivity
- Check sync logs in dashboard
- Restart sync service: `sudo systemctl restart mesophy-client`

## File Locations

- **Application**: `/opt/mesophy/client/`
- **Configuration**: `/opt/mesophy/config/config.json`
- **Database**: `/opt/mesophy/data/client.db`
- **Content Cache**: `/opt/mesophy/content/`
- **Logs**: `/opt/mesophy/logs/`
- **Service**: `/etc/systemd/system/mesophy-client.service`

## Hardware Requirements

- **Minimum**: Raspberry Pi 3B+ with 1GB RAM
- **Recommended**: Raspberry Pi 4 with 2GB+ RAM
- **Storage**: 16GB+ microSD card (Class 10 or better)
- **Display**: HDMI monitor/TV
- **Network**: WiFi or Ethernet connection

## Supported Content

- **Images**: JPG, PNG, GIF, WebP
- **Videos**: MP4, WebM, MOV
- **Resolution**: Auto-adjusts to display capabilities
- **Optimization**: Uses platform's optimized thumbnails and compressed media

## Performance Tuning

### For Pi 3/Zero (Limited Performance)
```json
{
  "device": {
    "syncInterval": 300,
    "heartbeatInterval": 600
  },
  "display": {
    "width": 1280,
    "height": 720
  }
}
```

### For Pi 4/5 (High Performance)
```json
{
  "device": {
    "syncInterval": 60,
    "heartbeatInterval": 180
  },
  "display": {
    "width": 1920,
    "height": 1080
  }
}
```

## Support

- **Documentation**: https://github.com/JasonLazzuri/Mesophy
- **Issues**: https://github.com/JasonLazzuri/Mesophy/issues
- **Dashboard**: https://mesophy.vercel.app