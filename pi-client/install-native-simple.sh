#!/bin/bash

# Mesophy Pi Client - Simple Native Installation
# Sets up direct display rendering like Mediafy - no browser required

set -e

# Configuration
INSTALL_DIR="/opt/mesophy"
SERVICE_NAME="mesophy-native-display"
USER="pi"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
fi

log_info "Starting Mesophy Native Display installation..."

# Detect Pi model
PI_MODEL=$(cat /proc/cpuinfo | grep "Model" | head -1 | cut -d':' -f2 | xargs || echo "Unknown Pi")
log_info "Detected: $PI_MODEL"

# Update system packages
log_info "Updating system packages..."
apt-get update -qq > /dev/null 2>&1

# Install required packages
log_info "Installing required packages..."
apt-get install -y \
    python3 \
    python3-pip \
    python3-pil \
    python3-requests \
    python3-psutil \
    fbi \
    fbset \
    omxplayer \
    vlc \
    > /dev/null 2>&1

log_success "System packages installed"

# Create installation directory structure
log_info "Creating installation directories..."
mkdir -p $INSTALL_DIR/{config,content,temp,logs}
chown -R $USER:$USER $INSTALL_DIR

# Copy native display files
log_info "Installing native display manager..."
if [ -f "native-display.py" ]; then
    cp native-display.py $INSTALL_DIR/
    chmod +x $INSTALL_DIR/native-display.py
    chown $USER:$USER $INSTALL_DIR/native-display.py
else
    log_warning "native-display.py not found in current directory"
    log_info "Creating basic native-display.py..."
    
    cat > $INSTALL_DIR/native-display.py << 'EOF'
#!/usr/bin/env python3
print("Mesophy Native Display - Basic version")
print("For full version, run install from pi-client directory")
import time
try:
    while True:
        time.sleep(60)
except KeyboardInterrupt:
    pass
EOF
    chmod +x $INSTALL_DIR/native-display.py
    chown $USER:$USER $INSTALL_DIR/native-display.py
fi

# Copy additional Python modules
for module in api_client.py media_player.py; do
    if [ -f "$module" ]; then
        cp $module $INSTALL_DIR/
        chmod +x $INSTALL_DIR/$module
        chown $USER:$USER $INSTALL_DIR/$module
        log_success "Installed $module"
    else
        log_warning "$module not found in current directory"
    fi
done

# Create configuration file
log_info "Creating configuration file..."
cat > $INSTALL_DIR/config/config.json << 'EOF'
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
    "heartbeatInterval": 300
  },
  "display": {
    "width": 1920,
    "height": 1080,
    "fullscreen": true
  },
  "system": {
    "logLevel": "info",
    "autoStart": true
  }
}
EOF

chown $USER:$USER $INSTALL_DIR/config/config.json

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Mesophy Native Display Manager
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/native-display.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=DISPLAY=:0
Environment=FRAMEBUFFER=/dev/fb0

# Required for framebuffer access
SupplementaryGroups=video

# Give access to framebuffer and video
DeviceAllow=/dev/fb0 rw
DeviceAllow=/dev/tty1 rw
DeviceAllow=char-drm rw

[Install]
WantedBy=graphical-session.target
EOF

# Configure display settings for Pi
log_info "Configuring display settings..."

# Disable screen blanking
cat >> /boot/config.txt << 'EOF'

# Mesophy Native Display Configuration
# Disable screen blanking
hdmi_blanking=1
# Force HDMI output
hdmi_force_hotplug=1
# Disable overscan
disable_overscan=1
# Set GPU memory split for better graphics performance
gpu_mem=128
EOF

# Configure console settings to prevent text output on display
cat > /etc/systemd/system/disable-console-blanking.service << 'EOF'
[Unit]
Description=Disable console blanking for digital signage
DefaultDependencies=false
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo 0 > /sys/class/graphics/fbcon/cursor_blink'
ExecStart=/bin/sh -c 'setterm -blank 0 -powerdown 0 -powersave off < /dev/console > /dev/console 2>&1'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable disable-console-blanking.service > /dev/null 2>&1

# Set up framebuffer permissions
log_info "Setting up framebuffer permissions..."
cat > /etc/udev/rules.d/99-framebuffer.rules << 'EOF'
# Allow video group access to framebuffer
SUBSYSTEM=="graphics", KERNEL=="fb*", GROUP="video", MODE="0664"
EOF

# Add user to video group
usermod -a -G video $USER

# Install Python packages
log_info "Installing Python dependencies..."
pip3 install --quiet pillow requests psutil > /dev/null 2>&1 || log_warning "Some Python packages may not have installed correctly"

# Enable and start service
log_info "Enabling systemd service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Create utility commands
log_info "Creating utility commands..."
cat > /usr/local/bin/mesophy << 'EOF'
#!/bin/bash
# Mesophy utility command

case "$1" in
    start)
        sudo systemctl start mesophy-native-display
        ;;
    stop)
        sudo systemctl stop mesophy-native-display
        ;;
    restart)
        sudo systemctl restart mesophy-native-display
        ;;
    status)
        systemctl status mesophy-native-display
        ;;
    logs)
        journalctl -u mesophy-native-display -f
        ;;
    pair)
        echo "Check the display for the pairing code"
        journalctl -u mesophy-native-display -n 20 | grep -i "pairing\|code" || echo "No recent pairing activity found"
        ;;
    config)
        nano /opt/mesophy/config/config.json
        ;;
    *)
        echo "Mesophy Pi Client - Native Display"
        echo "Usage: mesophy {start|stop|restart|status|logs|pair|config}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the display service"
        echo "  stop     - Stop the display service"
        echo "  restart  - Restart the display service"
        echo "  status   - Show service status"
        echo "  logs     - View live logs"
        echo "  pair     - Show pairing information"
        echo "  config   - Edit configuration"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/mesophy

# Set ownership
chown -R $USER:$USER $INSTALL_DIR

# Clear screen
clear

# Display completion message
echo
echo "=================================="
log_success "Mesophy Native Display Installation Complete!"
echo "=================================="
echo
log_info "IMPORTANT: The system needs to reboot to activate display settings"
echo
log_info "After reboot:"
echo "1. The pairing code will appear automatically on the HDMI display"
echo "2. No browser navigation needed - code appears directly on screen"
echo "3. Go to mesophy.vercel.app to pair the device"
echo
log_info "Utility Commands:"
echo "• mesophy logs     - View live logs"
echo "• mesophy pair     - Show pairing info"
echo "• mesophy restart  - Restart display service"
echo "• mesophy status   - Check service status"
echo
log_info "Installation directory: $INSTALL_DIR"
echo
echo "Reboot now? (y/N)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    log_info "Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    log_warning "Remember to reboot before first use!"
    log_info "Run 'sudo reboot' when ready"
fi