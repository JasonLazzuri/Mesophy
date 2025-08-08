# Mesophy Digital Signage - Native Media Daemon

This is the completely rebuilt Raspberry Pi client application that uses native media players instead of a web server approach. The new system provides better performance, reliability, and true full-screen digital signage capabilities.

## 🎯 Key Features

### Native Media Playback
- **omxplayer** for hardware-accelerated video playback (MP4, MOV, WebM)
- **fbi/fim** for efficient image display (JPG, PNG, GIF)
- **VLC** as fallback for unsupported formats
- Direct framebuffer rendering for maximum performance
- Hardware GPU acceleration on Raspberry Pi

### Automatic Content Management
- Schedule-based content switching
- Automatic media downloading and caching
- Seamless transitions between media items
- Loop and duration controls for each media type

### True Digital Signage Appliance
- Works without browser dependencies
- Auto-starts on boot via systemd
- No user interaction required
- Pairing code displayed directly on screen
- Automatic display detection and configuration

### System Monitoring & Recovery
- Resource monitoring (CPU, memory, disk, temperature)
- Automatic error recovery
- Media player crash detection and restart
- Cache management and cleanup
- Performance optimization

## 🏗️ Architecture

```
Pi Boot → systemd → Media Daemon → [Display Detection] → [Pairing/Content]
                                          ↓
                        ┌─── Playlist Manager ────┐
                        │                         │
                        ├─ Content Downloader     │
                        ├─ Schedule Manager       │
                        ├─ Media Player Engine    │
                        └─ Resource Monitor ──────┘
```

### Core Components

1. **Media Daemon** (`media-daemon.js`) - Main orchestrator
2. **Media Player** (`lib/media-player.js`) - Native media playback
3. **Playlist Manager** (`lib/playlist-manager.js`) - Content sequencing
4. **Content Downloader** (`lib/content-downloader.js`) - Media synchronization
5. **Schedule Manager** (`lib/schedule-manager.js`) - Time-based switching
6. **Resource Monitor** (`lib/resource-monitor.js`) - System health

## 📦 Installation

### Prerequisites
- Raspberry Pi (3B+ or newer recommended)
- Raspbian/Raspberry Pi OS
- Node.js 16+
- Root access for installation

### Quick Install

```bash
# Clone or copy the pi-client directory to your Pi
cd pi-client

# Run the installation script
sudo ./install-daemon.sh
```

The installer will:
- Install system dependencies (omxplayer, fbi, ImageMagick, etc.)
- Create application directories
- Install Node.js dependencies  
- Set up systemd service
- Configure system for digital signage
- Set up management commands

### Manual Installation

```bash
# Install system packages
sudo apt update
sudo apt install -y omxplayer fbi fim vlc imagemagick fbset nodejs npm

# Create directories
sudo mkdir -p /opt/mesophy/{pi-client,config,data,content,logs}
sudo chown -R pi:pi /opt/mesophy

# Copy files
sudo cp media-daemon.js /opt/mesophy/pi-client/
sudo cp package.json /opt/mesophy/pi-client/
sudo cp -r lib/ /opt/mesophy/pi-client/

# Install dependencies
cd /opt/mesophy/pi-client
npm install --production

# Set up systemd service
sudo cp mesophy-media-daemon.service /etc/systemd/system/
sudo systemctl enable mesophy-media-daemon
sudo systemctl start mesophy-media-daemon
```

## 🎮 Usage

### Management Commands

After installation, use the `mesophy` command:

```bash
mesophy start     # Start the daemon
mesophy stop      # Stop the daemon
mesophy restart   # Restart the daemon
mesophy status    # Show daemon status
mesophy logs      # View live logs
mesophy pair      # Show pairing information
mesophy update    # Update dependencies
```

### Device Pairing

1. The Pi will automatically display a pairing code on screen
2. Visit https://mesophy.vercel.app
3. Login and navigate to **Screens**
4. Click **"Pair Device"**
5. Enter the pairing code
6. The Pi will automatically start playing content

### Configuration

The daemon creates configuration at `/opt/mesophy/config/config.json`:

```json
{
  "api": {
    "baseUrl": "https://mesophy.vercel.app",
    "endpoints": { ... }
  },
  "device": {
    "syncInterval": 120,
    "heartbeatInterval": 300,
    "mediaTransitionDelay": 1000
  },
  "media": {
    "videoPlayer": "omxplayer",
    "imageViewer": "fbi",
    "fallbackPlayer": "vlc",
    "defaultImageDuration": 10,
    "videoHardwareAcceleration": true
  },
  "monitoring": {
    "interval": 30000,
    "memoryThreshold": 85,
    "cpuThreshold": 90,
    "diskThreshold": 90,
    "tempThreshold": 75
  }
}
```

## 📱 Media Support

### Supported Formats

**Video:**
- MP4 (H.264/H.265)
- WebM
- MOV (QuickTime)
- AVI (via VLC fallback)

**Images:**
- JPEG/JPG
- PNG
- GIF
- WebP
- BMP

**Audio:**
- MP3
- WAV
- OGG

### Player Priorities

1. **omxplayer** - Primary video player (GPU accelerated)
2. **fbi** - Primary image viewer (framebuffer direct)
3. **VLC** - Fallback for unsupported formats
4. **mpv** - Alternative video player

## 🔧 System Integration

### Systemd Service

The daemon runs as a systemd service:

```bash
# Service status
sudo systemctl status mesophy-media-daemon

# Start/stop/restart
sudo systemctl start mesophy-media-daemon
sudo systemctl stop mesophy-media-daemon
sudo systemctl restart mesophy-media-daemon

# Enable/disable auto-start
sudo systemctl enable mesophy-media-daemon
sudo systemctl disable mesophy-media-daemon

# View logs
sudo journalctl -u mesophy-media-daemon -f
```

### File Structure

```
/opt/mesophy/
├── pi-client/          # Application code
│   ├── media-daemon.js
│   ├── package.json
│   └── lib/            # Core modules
├── config/             # Configuration files
├── data/               # Database files
├── content/            # Downloaded media cache
└── logs/               # Error logs
```

### Permissions

The service runs as user `pi` with access to:
- Video group (framebuffer access)
- Audio group (sound output)
- Read/write to `/opt/mesophy/`

## 🛠️ Troubleshooting

### Common Issues

**No display output:**
```bash
# Check framebuffer permissions
ls -la /dev/fb*
sudo chmod 666 /dev/fb0

# Verify display detection
sudo fbset -s
```

**Media won't play:**
```bash
# Test players manually
omxplayer /path/to/video.mp4
fbi -d /dev/fb0 -T 1 /path/to/image.jpg

# Check installed players
which omxplayer fbi vlc
```

**Pairing issues:**
```bash
# Check daemon status
mesophy status

# View pairing logs
mesophy logs | grep -i pair

# Manual pairing code check
mesophy pair
```

**High resource usage:**
```bash
# View resource status
mesophy logs | grep -i resource

# Check system resources
free -h
df -h
vcgencmd measure_temp  # Pi temperature
```

### Log Locations

- **Systemd logs**: `sudo journalctl -u mesophy-media-daemon`
- **Error logs**: `/opt/mesophy/logs/error-YYYY-MM-DD.log`
- **Application logs**: Console output via systemd

### Recovery Actions

The daemon includes automatic recovery for:
- Media player crashes
- High resource usage
- Network connectivity issues
- Critical application errors

Recovery attempts are limited to prevent infinite loops, after which the daemon will shut down cleanly for systemd to restart it.

## 🔄 Migration from Web Server

If migrating from the old Express.js web server approach:

1. **Backup current installation**
2. **Stop old service**: `sudo systemctl stop old-service`
3. **Install new daemon**: `sudo ./install-daemon.sh`
4. **Device will need re-pairing** (pairing codes are not transferable)
5. **Content will re-download** as needed

### Key Differences

| Old (Web Server) | New (Native Daemon) |
|------------------|---------------------|
| Browser required | Direct framebuffer |
| Manual navigation | Automatic startup |
| Web-based pairing | On-screen pairing |
| HTML/CSS rendering | Native media players |
| localhost:3000 | No web interface |

## 🚀 Performance Benefits

- **~50% less memory usage** (no browser overhead)
- **Hardware-accelerated video** (omxplayer GPU support)
- **Instant startup** (no browser loading time)
- **True fullscreen** (direct framebuffer access)
- **Better stability** (fewer dependencies)
- **Automatic recovery** (self-healing system)

## 📞 Support

For issues or questions:
1. Check logs: `mesophy logs`
2. Verify status: `mesophy status`
3. Review system resources
4. Check network connectivity
5. Ensure content is available

The native daemon provides comprehensive logging and monitoring to help diagnose any issues quickly.

---

**Mesophy Digital Signage - Native Media Daemon**  
*True digital signage appliance for Raspberry Pi*