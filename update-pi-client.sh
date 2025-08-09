#!/bin/bash

# Mediafy Pi Client Update Script
# This script downloads the latest client and preserves your credentials

echo "🔄 Updating Mediafy Pi Client..."

# Backup existing credentials if they exist
if [ -f "/opt/mediafy/device_credentials.json" ]; then
    echo "📋 Backing up device credentials..."
    cp /opt/mediafy/device_credentials.json /tmp/device_credentials_backup.json
fi

# Remove old installation
if [ -d "/opt/mediafy" ]; then
    echo "🗑️  Removing old installation..."
    sudo rm -rf /opt/mediafy
fi

# Create directory
sudo mkdir -p /opt/mediafy
cd /opt/mediafy

# Download latest client code
echo "⬇️  Downloading latest client code..."
sudo wget -q -O mediafy-client.zip https://github.com/JasonLazzuri/Mediafy/archive/refs/heads/main.zip

# Extract client files
echo "📦 Extracting files..."
sudo unzip -q mediafy-client.zip
sudo mv Mediafy-main/client/* .
sudo rm -rf Mediafy-main mediafy-client.zip

# Restore credentials if they existed
if [ -f "/tmp/device_credentials_backup.json" ]; then
    echo "📋 Restoring device credentials..."
    sudo cp /tmp/device_credentials_backup.json /opt/mediafy/device_credentials.json
    rm /tmp/device_credentials_backup.json
fi

# Set permissions
sudo chown -R pi:pi /opt/mediafy
chmod +x /opt/mediafy/src/main.py

# Create or update .env file
echo "⚙️  Setting up environment..."
cat > /opt/mediafy/.env << 'EOF'
API_BASE=https://mediafy-backend.onrender.com/api
WS_BASE=wss://mediafy-backend.onrender.com
DISPLAY_WIDTH=1920
DISPLAY_HEIGHT=1080
FULLSCREEN=true
ENABLE_HARDWARE_ACCELERATION=true
EOF

echo "✅ Update complete! Your device credentials have been preserved."
echo "🚀 Run with: cd /opt/mediafy && python3 src/main.py"