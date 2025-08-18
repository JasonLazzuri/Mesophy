#!/bin/bash
#
# Mesophy Digital Signage Service Installer
# This script installs the Pi client as a systemd service for auto-start
#

set -e

echo "🚀 Installing Mesophy Digital Signage Service..."

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root"
   echo "Please run as the pi user: ./install-service.sh"
   exit 1
fi

# Get the current directory (where the pi-client is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📁 Pi client directory: $CLIENT_DIR"

# Create necessary directories
echo "📂 Creating directories..."
sudo mkdir -p /opt/mesophy/config
sudo mkdir -p /opt/mesophy/content
sudo mkdir -p /opt/mesophy/logs

# Set proper ownership
echo "🔧 Setting directory permissions..."
sudo chown -R pi:pi /opt/mesophy
sudo chmod -R 755 /opt/mesophy

# Create a custom service file with the correct path
echo "📝 Creating service file..."
SERVICE_FILE="/tmp/mesophy-signage.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Mesophy Digital Signage Client
Documentation=https://github.com/JasonLazzuri/Mesophy
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=$CLIENT_DIR
ExecStart=/usr/bin/python3 $CLIENT_DIR/pi-client.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=PYTHONPATH=$CLIENT_DIR
Environment=PYTHONUNBUFFERED=1

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$CLIENT_DIR /opt/mesophy /tmp

[Install]
WantedBy=multi-user.target
EOF

# Install the service
echo "📦 Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/mesophy-signage.service
sudo systemctl daemon-reload

# Enable the service for auto-start
echo "🔄 Enabling service for auto-start..."
sudo systemctl enable mesophy-signage.service

# Check if Python dependencies are installed
echo "🐍 Checking Python dependencies..."
python3 -c "import requests, psutil" 2>/dev/null || {
    echo "📦 Installing required Python packages..."
    pip3 install --user requests psutil
}

# Stop any running instances
echo "🛑 Stopping any existing pi-client processes..."
pkill -f "pi-client.py" || true
sleep 2

# Start the service
echo "▶️ Starting Mesophy Digital Signage service..."
sudo systemctl start mesophy-signage.service

# Check service status
echo "📊 Service status:"
sudo systemctl status mesophy-signage.service --no-pager -l

echo ""
echo "✅ Installation complete!"
echo ""
echo "🔧 Useful commands:"
echo "  View logs:    sudo journalctl -u mesophy-signage -f"
echo "  Stop service: sudo systemctl stop mesophy-signage"
echo "  Start service: sudo systemctl start mesophy-signage"
echo "  Restart service: sudo systemctl restart mesophy-signage"
echo "  Disable auto-start: sudo systemctl disable mesophy-signage"
echo ""
echo "The Pi client will now automatically start at boot and restart if it crashes."

# Clean up
rm "$SERVICE_FILE"