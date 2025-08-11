# Mesophy Pi Client - 3rd Attempt

**Simple, reliable digital signage client for Raspberry Pi**

This is a clean rebuild of the Mesophy Pi client system, designed to be simple, reliable, and work like industry-standard solutions (Yodeck, OptiSigns).

## Key Features

✅ **One-Command Installation** - Single script installs everything  
✅ **Auto-Boot Display** - Shows pairing code immediately on HDMI  
✅ **Simple Pairing** - Enter 6-digit code in web portal  
✅ **Reliable Display** - Direct framebuffer rendering with FBI  
✅ **Offline Operation** - Local content caching  
✅ **Remote Management** - Control from web portal after pairing  

## Quick Start

### Installation

1. **Download and run installer:**
   ```bash
   curl -sSL https://raw.githubusercontent.com/your-repo/mesophy/main/3rd-attempt-pi-client/install.sh | sudo bash
   ```

2. **Or manual installation:**
   ```bash
   git clone https://github.com/your-repo/mesophy.git
   cd mesophy/3rd-attempt-pi-client
   sudo ./install.sh
   ```

3. **Reboot the Pi:**
   ```bash
   sudo reboot
   ```

### Pairing Process

1. **Pi displays pairing code** - Large 6-digit code appears on HDMI screen
2. **Go to web portal** - Visit https://mesophy.vercel.app  
3. **Enter pairing code** - Navigate to Screens → Pair Device
4. **Assign to screen** - Select which screen this Pi controls
5. **Content starts automatically** - Pi begins displaying scheduled content

## Architecture

### Simple State Machine
```
NOT_PAIRED → WAITING_FOR_MEDIA → PLAYING_CONTENT
     ↑              ↓                    ↓
     └──────── Error Recovery ←─────────┘
```

### File Structure
```
/opt/mesophy/
├── pi-client.py           # Main application
├── lib/
│   ├── display_manager.py # HDMI display control (FBI)
│   ├── api_client.py      # Backend communication
│   ├── state_manager.py   # Simple state machine
│   └── content_manager.py # Media download/cache
├── config/
│   └── client.conf        # Configuration file
├── content/               # Downloaded media cache
├── logs/                  # Application logs
└── temp/                  # Temporary files
```

## System Management

### Service Commands
```bash
# Check status
sudo systemctl status mesophy-pi-client

# Start/stop/restart
sudo systemctl start mesophy-pi-client
sudo systemctl stop mesophy-pi-client
sudo systemctl restart mesophy-pi-client

# View logs
sudo journalctl -u mesophy-pi-client -f
tail -f /opt/mesophy/logs/pi-client.log
```

### Configuration
Edit `/opt/mesophy/config/client.conf`:
```json
{
  "api_base_url": "https://mesophy.vercel.app",
  "device_id": null,
  "screen_id": null,
  "pairing_code": null,
  "cache_dir": "/opt/mesophy/content",
  "log_level": "INFO",
  "display": {
    "width": 1920,
    "height": 1080,
    "fullscreen": true
  }
}
```

## Troubleshooting

### No Display on HDMI
```bash
# Check if FBI is working
sudo fbi -d /dev/fb0 -T 1 /some/image.png

# Check framebuffer
ls -la /dev/fb0

# Check service logs
sudo journalctl -u mesophy-pi-client -n 50
```

### Pairing Issues
```bash
# Check network connectivity
ping mesophy.vercel.app

# Test API manually
curl https://mesophy.vercel.app/api/devices/generate-code

# Reset pairing
sudo rm /opt/mesophy/config/client.conf
sudo systemctl restart mesophy-pi-client
```

### Content Not Displaying
```bash
# Check content cache
ls -la /opt/mesophy/content/

# Force content sync
# (This will be implemented in future version)

# Check schedule API
curl https://mesophy.vercel.app/api/screens/SCREEN_ID/current-content
```

## Development

### Running in Development Mode
```bash
# Install dependencies
sudo apt install python3 python3-pip python3-pil fbi
pip3 install requests pillow

# Run directly
cd /opt/mesophy
python3 pi-client.py --config config/client.conf
```

### Testing Display Functions
```python
# Test display manager
python3 -c "
import sys
sys.path.append('/opt/mesophy/lib')
from display_manager import DisplayManager
config = {'display': {'width': 1920, 'height': 1080}}
dm = DisplayManager(config)
dm.show_pairing_code('123456')
"
```

## Differences from Previous Attempts

### What's Better
- ✅ **Single Python application** instead of complex bash scripts
- ✅ **Reliable HDMI output** using PIL + FBI
- ✅ **Clean state machine** with proper error handling  
- ✅ **One installer** instead of 10+ confusing scripts
- ✅ **Industry-standard UX** like Yodeck/OptiSigns
- ✅ **Proper logging** without stdout pollution

### What's Simpler
- ✅ **No Node.js** - Pure Python application
- ✅ **No browser/X11** - Direct framebuffer rendering
- ✅ **No complex bash** - Simple Python logic
- ✅ **Clear separation** - Each component has single responsibility

### What Works Now
- ✅ **State detection** - No more "Unknown state" errors
- ✅ **Display output** - Actually shows content on HDMI
- ✅ **API integration** - Proper error handling and retries
- ✅ **Boot process** - Auto-starts and displays pairing code

## Support

- **Installation Issues**: Check installer logs and ensure Pi has internet
- **Display Issues**: Verify HDMI connection and framebuffer access
- **API Issues**: Check network connectivity and API status
- **General Questions**: Review logs in `/opt/mesophy/logs/`

## Version History

- **v3.0** - Complete rebuild with Python, single installer, reliable display
- **v2.x** - Complex bash system (deprecated)  
- **v1.x** - Initial implementation (deprecated)

This version is designed to work reliably and simply, just like professional digital signage solutions.