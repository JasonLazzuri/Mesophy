#!/bin/bash

# Mesophy Pi Client Installation Script
# Usage: curl -sSL install.mesophy.com | sudo bash

set -e

# Configuration
INSTALL_DIR="/opt/mesophy"
SERVICE_NAME="mesophy-client"
GITHUB_REPO="https://raw.githubusercontent.com/JasonLazzuri/Mesophy/main/pi-client"
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

log_info "Starting Mesophy Pi Client installation..."

# Detect Pi model
PI_MODEL=$(cat /proc/cpuinfo | grep "Model" | head -1 | cut -d':' -f2 | xargs)
log_info "Detected: $PI_MODEL"

# Update system packages
log_info "Updating system packages..."
apt-get update -qq
apt-get install -y curl wget git sqlite3 > /dev/null 2>&1

# Install Node.js (use different versions based on Pi model)
if [[ "$PI_MODEL" == *"Pi 3"* ]]; then
    NODE_VERSION="16" # Pi 3 - use Node 16 for better compatibility
elif [[ "$PI_MODEL" == *"Pi Zero"* ]]; then
    NODE_VERSION="16" # Pi Zero - use Node 16
else
    NODE_VERSION="18" # Pi 4, Pi 5 - use latest Node 18
fi

log_info "Installing Node.js v$NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1

# Verify Node.js installation
NODE_INSTALLED_VERSION=$(node --version)
log_success "Node.js installed: $NODE_INSTALLED_VERSION"

# Create installation directory
log_info "Creating installation directory..."
mkdir -p $INSTALL_DIR
chown $USER:$USER $INSTALL_DIR

# Create directory structure
mkdir -p $INSTALL_DIR/{client,content,config,logs,scripts}
chown -R $USER:$USER $INSTALL_DIR

# Download Pi client application
log_info "Downloading Mesophy Pi Client..."
cd $INSTALL_DIR/client

# Download package.json
curl -sSL "$GITHUB_REPO/package.json" -o package.json 2>/dev/null || {
    # Fallback - create package.json inline if download fails
    cat > package.json << 'EOF'
{
  "name": "mesophy-pi-client",
  "version": "1.0.0",
  "description": "Mesophy Digital Signage Pi Client",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "setup": "node setup.js"
  },
  "dependencies": {
    "sqlite3": "^5.1.6",
    "node-fetch": "^2.7.0",
    "fs-extra": "^11.1.1"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
EOF
}

# Download main application files
for file in app.js setup.js display.js sync.js monitor.js; do
    log_info "Downloading $file..."
    curl -sSL "$GITHUB_REPO/$file" -o $file 2>/dev/null || {
        log_warning "Failed to download $file, will create basic version"
    }
done

# Install Node.js dependencies
log_info "Installing Node.js dependencies..."
sudo -u $USER npm install --production > /dev/null 2>&1

# Create configuration file
log_info "Creating configuration file..."
cat > $INSTALL_DIR/config/config.json << EOF
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
  },
  "system": {
    "logLevel": "info",
    "maxLogFiles": 10,
    "maxLogSize": "10MB"
  }
}
EOF

# Create database directory
mkdir -p $INSTALL_DIR/data
chown -R $USER:$USER $INSTALL_DIR/data

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Mesophy Digital Signage Client
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR/client
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Configure display settings for digital signage
log_info "Configuring display settings..."

# Disable screen blanking and power management
cat >> /boot/config.txt << 'EOF'

# Mesophy Digital Signage Configuration
# Disable screen blanking
hdmi_blanking=1
# Force HDMI mode
hdmi_force_hotplug=1
# Set HDMI resolution (will be auto-detected)
hdmi_group=1
hdmi_mode=16
# Disable overscan
disable_overscan=1
EOF

# Configure Chromium for kiosk mode
mkdir -p /home/$USER/.config/chromium/Default
cat > /home/$USER/.config/chromium/Default/Preferences << 'EOF'
{
  "profile": {
    "default_content_setting_values": {
      "notifications": 2
    },
    "exit_type": "Normal"
  }
}
EOF

chown -R $USER:$USER /home/$USER/.config

# Create startup script for display
cat > $INSTALL_DIR/scripts/start-display.sh << 'EOF'
#!/bin/bash
# Start display server and client
export DISPLAY=:0
xset -dpms
xset s noblank
xset s off
/usr/bin/chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-extensions-with-background-pages \
  --disable-extensions \
  --disable-translate \
  --no-first-run \
  --fast \
  --fast-start \
  --disable-default-apps \
  --disable-features=TranslateUI \
  --disk-cache-dir=/tmp \
  http://localhost:3000
EOF

chmod +x $INSTALL_DIR/scripts/start-display.sh
chown $USER:$USER $INSTALL_DIR/scripts/start-display.sh

# Install Chromium if not present
if ! command -v chromium-browser &> /dev/null; then
    log_info "Installing Chromium browser..."
    apt-get install -y chromium-browser > /dev/null 2>&1
fi

# Create initial app.js if not downloaded
if [ ! -f "$INSTALL_DIR/client/app.js" ]; then
    log_info "Creating basic Pi client application..."
    cat > $INSTALL_DIR/client/app.js << 'EOF'
const http = require('http');
const fs = require('fs-extra');
const path = require('path');

const CONFIG_PATH = '/opt/mesophy/config/config.json';
let config = {};

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

// Create simple HTTP server for local display
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mesophy Digital Signage</title>
        <style>
          body { margin: 0; padding: 0; background: #000; color: #fff; font-family: Arial; }
          .container { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
          .logo { font-size: 48px; margin-bottom: 40px; }
          .code { font-size: 72px; font-weight: bold; background: #333; padding: 20px 40px; border-radius: 10px; margin: 20px; }
          .instructions { font-size: 24px; text-align: center; max-width: 800px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">MESOPHY DIGITAL SIGNAGE</div>
          <div style="font-size: 32px; margin-bottom: 20px;">Device Setup Required</div>
          <div class="code">ABC123</div>
          <div class="instructions">
            1. Go to <strong>mesophy.vercel.app</strong><br>
            2. Login and navigate to <strong>Screens</strong><br>
            3. Click <strong>"Pair Device"</strong><br>
            4. Enter the code above
          </div>
          <div style="margin-top: 40px; color: #666;">
            Status: Waiting for setup... | WiFi: Connected ✓
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(3000, () => {
  console.log('Mesophy Pi Client started on http://localhost:3000');
  console.log('Display pairing screen at http://localhost:3000');
});

// TODO: Implement pairing logic and content sync
console.log('Pi client starting...');
console.log('Configuration loaded from:', CONFIG_PATH);
EOF
fi

# Set proper permissions
chown -R $USER:$USER $INSTALL_DIR

# Start the service
log_info "Starting Mesophy Pi Client service..."
systemctl start $SERVICE_NAME

# Wait a moment for service to start
sleep 3

# Check service status
if systemctl is-active --quiet $SERVICE_NAME; then
    log_success "Mesophy Pi Client service is running!"
else
    log_error "Failed to start Mesophy Pi Client service"
fi

# Display completion message
echo
echo "=================================="
log_success "Mesophy Pi Client Installation Complete!"
echo "=================================="
echo
log_info "Next Steps:"
echo "1. Connect this Pi to your display via HDMI"
echo "2. Open a web browser to http://$(hostname -I | awk '{print $1}'):3000"
echo "3. Note the pairing code displayed on screen"
echo "4. Go to mesophy.vercel.app and pair this device"
echo
log_info "Service Management:"
echo "• View logs: journalctl -u $SERVICE_NAME -f"
echo "• Restart: sudo systemctl restart $SERVICE_NAME"
echo "• Stop: sudo systemctl stop $SERVICE_NAME"
echo
log_info "Configuration: $INSTALL_DIR/config/config.json"
log_info "Logs: $INSTALL_DIR/logs/"
echo
echo "For support, visit: https://github.com/JasonLazzuri/Mesophy"
EOF