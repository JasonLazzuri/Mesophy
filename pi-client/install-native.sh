#!/bin/bash

# Mesophy Pi Native Media Client Installation Script
# Usage: curl -sSL https://mesophy.vercel.app/api/devices/installer | sudo bash

set -e

# Configuration
INSTALL_DIR="/opt/mesophy"
SERVICE_NAME="mesophy-media-daemon"
GITHUB_REPO="https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client"
USER="pi"
LOG_DIR="/opt/mesophy/logs"
CONFIG_DIR="/opt/mesophy/config"
CONTENT_DIR="/opt/mesophy/content"
DATA_DIR="/opt/mesophy/data"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
fi

# Banner
echo -e "${CYAN}"
cat << "EOF"
  __  __                       _            
 |  \/  | ___  ___  ___  _ __ | |__  _   _  
 | |\/| |/ _ \/ __|/ _ \| '_ \| '_ \| | | | 
 | |  | |  __/\__ \ (_) | |_) | | | | |_| | 
 |_|  |_|\___||___/\___/| .__/|_| |_|\__, | 
                        |_|          |___/  
 
   🎬 Native Digital Signage Client 🎬
EOF
echo -e "${NC}"

log_info "Starting Mesophy Pi Native Media Client installation..."

# Detect Pi model and capabilities
PI_MODEL=$(cat /proc/cpuinfo | grep "Model" | head -1 | cut -d':' -f2 | xargs || echo "Unknown Pi Model")
PI_REVISION=$(cat /proc/cpuinfo | grep "Revision" | head -1 | cut -d':' -f2 | xargs || echo "Unknown")
MEMORY_MB=$(awk '/MemTotal/ { printf "%.0f", $2/1024 }' /proc/meminfo)
GPU_MEMORY=$(vcgencmd get_mem gpu | cut -d'=' -f2 | cut -d'M' -f1)

log_info "Detected: $PI_MODEL (Rev: $PI_REVISION)"
log_info "Total Memory: ${MEMORY_MB}MB, GPU Memory: ${GPU_MEMORY}MB"

# Check minimum requirements
if [[ $MEMORY_MB -lt 512 ]]; then
    log_warning "Low memory detected (${MEMORY_MB}MB). Pi 3B+ or newer recommended."
fi

# Step 1: Update system packages
log_step "1/8 Updating system packages..."
apt-get update -qq || log_error "Failed to update package list"
apt-get upgrade -y -qq || log_warning "Some packages failed to upgrade"

# Step 2: Install system dependencies for native media playback
log_step "2/8 Installing native media player dependencies..."

# Core system packages
apt-get install -y \
    curl \
    wget \
    git \
    sqlite3 \
    unzip \
    psmisc \
    bc \
    xxd \
    imagemagick \
    qrencode \
    fbset \
    console-tools || log_error "Failed to install core packages"

# Media player packages
log_info "Installing media players..."

# Install omxplayer (if available) for hardware-accelerated video
if ! command -v omxplayer &> /dev/null; then
    apt-get install -y omxplayer || log_warning "omxplayer not available, using VLC fallback"
fi

# Install VLC for comprehensive media support
apt-get install -y vlc || log_error "Failed to install VLC"

# Install fbi for image display
apt-get install -y fbi || log_error "Failed to install fbi image viewer"

# Install additional image tools
apt-get install -y fim || log_warning "fim not available, using fbi only"

# Install framebuffer utilities
apt-get install -y fbset fbcat || log_warning "Some framebuffer tools not available"

log_success "Media player dependencies installed"

# Step 3: Install Node.js
log_step "3/8 Installing Node.js..."

# Check if Node.js is already installed with correct version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -ge 16 ]]; then
        log_info "Node.js v$(node -v) already installed"
    else
        log_warning "Node.js version too old, updating..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
else
    log_info "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs || log_error "Failed to install Node.js"
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
log_success "Node.js $NODE_VERSION and npm $NPM_VERSION installed"

# Step 4: Create directories and set permissions
log_step "4/8 Setting up directories..."

# Create all required directories
mkdir -p "$INSTALL_DIR"/{client,config,data,content,logs}
mkdir -p "$CONTENT_DIR"/{images,videos,cache}
mkdir -p "$DATA_DIR"/{playlists,schedules}

# Set ownership to pi user
chown -R $USER:$USER "$INSTALL_DIR"

# Set proper permissions
chmod 755 "$INSTALL_DIR"
chmod 755 "$CONTENT_DIR"
chmod 755 "$DATA_DIR"
chmod 755 "$LOG_DIR"
chmod 755 "$CONFIG_DIR"

log_success "Directory structure created"

# Step 5: Download Pi native media client
log_step "5/8 Downloading Mesophy Native Media Client..."
cd "$INSTALL_DIR/client"

# Download main daemon file
log_info "Downloading main media daemon..."
if curl -sSL "$GITHUB_REPO/media-daemon.js" -o media-daemon.js; then
    log_success "✓ Media daemon downloaded successfully"
else
    log_error "✗ Failed to download main media-daemon.js"
    log_error "Cannot proceed without main daemon file."
    log_error "Please check your internet connection and try again."
    exit 1
fi

# Download library files with proper error checking
mkdir -p lib
log_info "Downloading native media player libraries..."

# Required library files for native media player system
declare -a REQUIRED_LIBS=(
    "media-player.js"
    "playlist-manager.js" 
    "content-downloader.js"
    "schedule-manager.js"
    "display-manager.js"
    "display-config.js"
    "pairing-overlay.js"
    "resource-monitor.js"
)

DOWNLOAD_FAILED=false
for lib_file in "${REQUIRED_LIBS[@]}"; do
    log_info "Downloading $lib_file..."
    if curl -sSL "$GITHUB_REPO/lib/$lib_file" -o "lib/$lib_file"; then
        log_info "✓ $lib_file downloaded successfully"
    else
        log_error "✗ Failed to download $lib_file"
        DOWNLOAD_FAILED=true
    fi
done

if [[ "$DOWNLOAD_FAILED" == true ]]; then
    log_error "Critical library files failed to download. Cannot proceed."
    log_error "Please check your internet connection and try again."
    exit 1
fi

# Download package.json
curl -sSL "$GITHUB_REPO/package.json" -o package.json 2>/dev/null || {
    log_info "Creating package.json for native media client..."
    cat > package.json << 'EOF'
{
  "name": "mesophy-pi-native-client",
  "version": "2.0.0",
  "description": "Mesophy Digital Signage Pi Native Media Client",
  "main": "media-daemon.js",
  "scripts": {
    "start": "node media-daemon.js",
    "daemon": "node media-daemon.js --daemon",
    "test": "node media-daemon.js --test"
  },
  "dependencies": {
    "sqlite3": "^5.1.6",
    "node-fetch": "^2.7.0",
    "fs-extra": "^11.1.1",
    "child_process": "^1.0.2",
    "qrcode": "^1.5.3"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "keywords": ["digital-signage", "raspberry-pi", "media", "native"],
  "author": "Mesophy",
  "license": "MIT"
}
EOF
}

# Make daemon executable
chmod +x media-daemon.js

log_success "Native media client downloaded"

# Step 6: Install Node.js dependencies
log_step "6/8 Installing Node.js dependencies..."
su -c "cd '$INSTALL_DIR/client' && npm install --production" $USER || log_error "Failed to install npm dependencies"
log_success "Node.js dependencies installed"

# Step 7: Configure system for digital signage
log_step "7/8 Configuring system for digital signage..."

# Configure GPU memory split for better video performance
if [[ $GPU_MEMORY -lt 128 ]]; then
    log_info "Configuring GPU memory split for video acceleration..."
    echo "gpu_mem=128" >> /boot/config.txt
    log_warning "GPU memory increased to 128MB. Reboot required to take effect."
fi

# Enable hardware video acceleration
grep -q "dtparam=audio=on" /boot/config.txt || echo "dtparam=audio=on" >> /boot/config.txt
grep -q "gpu_mem_1024=128" /boot/config.txt || echo "gpu_mem_1024=128" >> /boot/config.txt

# Disable screen blanking and power management
if ! grep -q "consoleblank=0" /boot/cmdline.txt; then
    sed -i 's/$/ consoleblank=0/' /boot/cmdline.txt
fi

# Configure framebuffer for display management
echo 'FRAMEBUFFER=/dev/fb0' >> /etc/environment

# Create default configuration
log_info "Creating default configuration..."
cat > "$CONFIG_DIR/config.json" << EOF
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
  "media": {
    "videoPlayer": "omxplayer",
    "imageViewer": "fbi",
    "fallbackPlayer": "vlc",
    "transitionDuration": 1000,
    "defaultImageDuration": 10000
  },
  "display": {
    "autoDetect": true,
    "width": 1920,
    "height": 1080,
    "refreshRate": 60,
    "overscan": 0,
    "rotation": 0
  },
  "device": {
    "syncInterval": 120,
    "heartbeatInterval": 300,
    "pairingCodeRefresh": 900,
    "maxRetries": 5
  },
  "system": {
    "logLevel": "info",
    "maxLogFiles": 10,
    "resourceMonitoring": true
  }
}
EOF

chown $USER:$USER "$CONFIG_DIR/config.json"
log_success "Configuration created"

# Step 8: Create and install systemd service
log_step "8/8 Installing systemd service..."

# Download or create systemd service file
curl -sSL "$GITHUB_REPO/mesophy-media-daemon.service" -o /etc/systemd/system/$SERVICE_NAME.service 2>/dev/null || {
    log_info "Creating systemd service file..."
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Mesophy Pi Native Media Daemon
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR/client
ExecStart=/usr/bin/node media-daemon.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mesophy-media-daemon

# Environment variables
Environment=NODE_ENV=production
Environment=MESOPHY_CONFIG=$CONFIG_DIR/config.json
Environment=MESOPHY_CONTENT=$CONTENT_DIR
Environment=MESOPHY_DATA=$DATA_DIR
Environment=MESOPHY_LOGS=$LOG_DIR

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR
ReadWritePaths=/tmp
ReadWritePaths=/dev/fb0

[Install]
WantedBy=multi-user.target
EOF
}

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable $SERVICE_NAME
log_success "Service installed and enabled"

# Add user to necessary groups for hardware access
usermod -a -G video,audio,gpio,spi,i2c $USER || log_warning "Some user groups not available"

# Create management commands
log_info "Creating management commands..."
cat > /usr/local/bin/mesophy-status << EOF
#!/bin/bash
systemctl status $SERVICE_NAME
EOF

cat > /usr/local/bin/mesophy-logs << EOF
#!/bin/bash
journalctl -u $SERVICE_NAME -f
EOF

cat > /usr/local/bin/mesophy-restart << EOF
#!/bin/bash
sudo systemctl restart $SERVICE_NAME
echo "Mesophy service restarted"
EOF

chmod +x /usr/local/bin/mesophy-*

# Final setup and start service
log_success "Installation completed successfully!"

echo
echo -e "${GREEN}🎉 Mesophy Pi Native Media Client Installation Complete! 🎉${NC}"
echo
echo -e "${CYAN}System Information:${NC}"
echo "  • Installation Directory: $INSTALL_DIR"
echo "  • Configuration File: $CONFIG_DIR/config.json"
echo "  • Content Directory: $CONTENT_DIR"
echo "  • Log Directory: $LOG_DIR"
echo "  • Service Name: $SERVICE_NAME"
echo
echo -e "${CYAN}Management Commands:${NC}"
echo "  • Check status: mesophy-status"
echo "  • View logs: mesophy-logs"
echo "  • Restart service: mesophy-restart"
echo "  • Manual control: sudo systemctl {start|stop|restart} $SERVICE_NAME"
echo
echo -e "${CYAN}Next Steps:${NC}"
echo "  1. The service will start automatically on boot"
echo "  2. Connect an HDMI display to see the pairing code"
echo "  3. Go to your Mesophy dashboard (https://mesophy.vercel.app)"
echo "  4. Navigate to Screens → Pair Device"
echo "  5. Enter the pairing code displayed on the Pi"
echo "  6. Select which screen this Pi should control"
echo
echo -e "${YELLOW}Starting the service now...${NC}"
systemctl start $SERVICE_NAME

sleep 3

sleep 5  # Give service more time to start

if systemctl is-active --quiet $SERVICE_NAME; then
    log_success "Mesophy service is running!"
    echo
    echo -e "${GREEN}✅ Installation successful!${NC}"
    echo -e "${BLUE}The Pi will display a pairing code on the connected HDMI display.${NC}"
    echo -e "${BLUE}Use the Mesophy dashboard to complete device pairing.${NC}"
    
    # Check if the service is actually working (not just running)
    sleep 3
    if journalctl -u $SERVICE_NAME --since="30 seconds ago" | grep -q "ERROR\|Failed\|Error"; then
        log_warning "Service is running but may have errors. Check logs with: mesophy-logs"
        echo -e "${YELLOW}If you see connection errors, the service will retry automatically.${NC}"
    fi
else
    log_warning "Service failed to start properly."
    echo -e "${YELLOW}Try starting manually: sudo systemctl start $SERVICE_NAME${NC}"
    echo -e "${YELLOW}Check logs: mesophy-logs${NC}"
fi

echo
echo -e "${PURPLE}📋 Installation Summary:${NC}"
echo -e "${GREEN}✅ Native media client installed successfully${NC}"
echo -e "${GREEN}✅ Service started and enabled for auto-boot${NC}"
echo -e "${GREEN}✅ GPU memory optimized for video playback${NC}"
echo
echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
echo -e "${YELLOW}A reboot is recommended to apply GPU memory optimizations.${NC}"
echo -e "${YELLOW}You can reboot now with: sudo reboot${NC}"
echo
echo -e "${BLUE}Without reboot:${NC} Basic functionality will work"
echo -e "${BLUE}After reboot:${NC} Full hardware acceleration enabled"
echo
log_info "Installation complete! The Pi is ready for digital signage operation."
echo -e "${CYAN}To reboot: sudo reboot${NC}"