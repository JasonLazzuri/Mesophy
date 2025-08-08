# Mesophy Pi Client - Native Display (Simplified)

**Direct screen rendering like Mediafy - no browser required**

## Key Features

✅ **Zero User Interaction** - Pairing code appears automatically on HDMI display  
✅ **No Browser Needed** - Direct framebuffer rendering like Mediafy  
✅ **Hardware Accelerated** - Uses omxplayer for videos, fbi for images  
✅ **Automatic Boot Display** - Shows pairing screen immediately on startup  
✅ **Simple Installation** - Single installer script  

## Installation

### Quick Install (Recommended)
```bash
curl -sSL https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client/install-native-simple.sh | sudo bash
```

### Manual Install
```bash
git clone https://github.com/JasonLazzuri/Mesophy.git
cd Mesophy/pi-client
sudo ./install-native-simple.sh
```

## How It Works

**Like Mediafy's seamless approach:**

1. **Pi boots** → Pairing code appears immediately on HDMI display
2. **No browser navigation** → Code is visible directly on screen  
3. **User pairs device** → Goes to dashboard and enters the code
4. **Content plays natively** → Hardware-accelerated video/image playback

## User Experience

### Before (Current Complex System)
- Pi boots → User must navigate browser to localhost:3000 → Find pairing code → Pair device
- **Problem:** Requires manual browser interaction

### After (New Native System)
- Pi boots → Pairing code appears automatically on screen → User pairs device
- **Solution:** Zero manual steps, just like Mediafy

## Architecture

```
┌─────────────────────────────────────┐
│            HDMI Display             │
│  ┌─────────────────────────────────┐│
│  │    Pairing Code: ABC123        ││  ← Direct framebuffer rendering
│  │                                ││
│  │  1. Go to mesophy.vercel.app   ││
│  │  2. Login → Screens → Pair     ││
│  │  3. Enter code: ABC123         ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
            ↑
    ┌───────────────┐
    │ Raspberry Pi  │
    │               │
    │ Python        │  ← Native display manager
    │ + PIL         │  ← Image generation
    │ + fbi         │  ← Framebuffer display  
    │ + omxplayer   │  ← Hardware video
    └───────────────┘
```

## Components

### 1. Native Display Manager (`native-display.py`)
- **Direct HDMI output** using PIL + fbi (like Mediafy's approach)
- **Automatic pairing screen** generation and display
- **No web server** - pure native rendering
- **Seamless transition** from pairing to content

### 2. Native Media Player (`media-player.py`) 
- **Hardware-accelerated video** using omxplayer
- **Efficient image display** using fbi
- **Smart content caching** and playlist management
- **Automatic failover** to VLC if omxplayer unavailable

### 3. API Communication (`api-client.py`)
- **Background sync** and heartbeat services
- **Separate from display** - runs independently
- **Content download** and cache management
- **System monitoring** and status reporting

## Management Commands

```bash
# Service control
mesophy start       # Start display service
mesophy stop        # Stop display service  
mesophy restart     # Restart display service
mesophy status      # Check service status

# Monitoring
mesophy logs        # View live logs
mesophy pair        # Show pairing information

# Configuration
mesophy config      # Edit configuration file
```

## Configuration

**Location:** `/opt/mesophy/config/config.json`

```json
{
  "api": {
    "baseUrl": "https://mesophy.vercel.app"
  },
  "display": {
    "width": 1920,
    "height": 1080,
    "fullscreen": true
  },
  "device": {
    "syncInterval": 120,
    "heartbeatInterval": 300
  }
}
```

## File Structure

```
/opt/mesophy/
├── native-display.py      # Main display manager
├── media-player.py        # Native media playback
├── api-client.py          # Background API services
├── config/
│   ├── config.json        # Main configuration
│   └── device.json        # Device pairing info (auto-created)
├── content/               # Downloaded media files
├── temp/                  # Generated display images
└── logs/                  # Application logs
```

## Troubleshooting

### No Display Output
```bash
# Check framebuffer
sudo fbset -s

# Check service status  
mesophy status

# View logs
mesophy logs
```

### Pairing Issues
```bash
# Check pairing code
mesophy pair

# Restart service
mesophy restart

# Check network
ping google.com
```

### Content Not Playing
```bash
# Check content sync
mesophy logs | grep -i sync

# Verify media files
ls -la /opt/mesophy/content/

# Test hardware acceleration
omxplayer --info
```

## Comparison: Complex vs Simple

| Aspect | Old Complex System | New Native System |
|--------|-------------------|-------------------|
| **Display** | Web browser → localhost:3000 | Direct HDMI output |
| **User Steps** | Navigate browser manually | Automatic display |
| **Dependencies** | Node.js, SQLite, 991-line overlay | Python, PIL, fbi |
| **Boot Time** | ~30s (browser loading) | ~5s (instant display) |
| **Reliability** | Multiple failure points | Single native path |
| **Like Mediafy** | ❌ Required browser | ✅ Direct display |

## Hardware Requirements

- **Minimum:** Raspberry Pi 3B+
- **Recommended:** Raspberry Pi 4 (2GB+)
- **Storage:** 8GB+ microSD card
- **Display:** HDMI monitor/TV
- **Network:** WiFi or Ethernet

## Support

- **Documentation:** This README
- **Logs:** `mesophy logs`
- **Configuration:** `mesophy config`
- **Status:** `mesophy status`