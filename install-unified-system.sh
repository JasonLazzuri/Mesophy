#!/bin/bash

# install-unified-system.sh - Install the unified Mesophy signage system
# This script sets up everything needed for the new unified system

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S')${NC} - $1"
}

success_message() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

error_message() {
    echo -e "${RED}ERROR:${NC} $1" >&2
}

warning_message() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

# Check if running as pi user
if [[ "$USER" != "pi" ]]; then
    error_message "This script must be run as the 'pi' user"
    echo "Please run: su - pi, then run this script again"
    exit 1
fi

log_message "Installing Mesophy Unified Digital Signage System"
echo "======================================================="

# Update system
log_message "Updating package repositories..."
sudo apt-get update -qq

# Install dependencies
log_message "Installing system dependencies..."
sudo apt-get install -y \
    fbi \
    vlc \
    curl \
    python3 \
    python3-pip \
    imagemagick \
    qrencode \
    git

# Install Python packages
log_message "Installing Python packages..."
sudo pip3 install pillow requests qrcode[pil]

# Create directories
log_message "Creating system directories..."
sudo mkdir -p /opt/mesophy
sudo mkdir -p /opt/mesophy/config
sudo mkdir -p /var/log
sudo chown -R pi:pi /opt/mesophy

# Copy main script
log_message "Installing unified mesophy-signage script..."
if [[ -f "./mesophy-signage" ]]; then
    sudo cp ./mesophy-signage /opt/mesophy/
    sudo chmod +x /opt/mesophy/mesophy-signage
    sudo chown pi:pi /opt/mesophy/mesophy-signage
else
    error_message "mesophy-signage script not found in current directory"
    exit 1
fi

# Create convenient symlinks
log_message "Creating system shortcuts..."
sudo ln -sf /opt/mesophy/mesophy-signage /usr/local/bin/mesophy-signage
sudo ln -sf /opt/mesophy/mesophy-signage /usr/local/bin/pi-signage  # Backward compatibility

# Install systemd service
log_message "Installing systemd service..."
if [[ -f "./mesophy-signage.service" ]]; then
    # We copy it but DO NOT enable it by default
    # The .bashrc method is preferred for fbi/console access
    sudo cp ./mesophy-signage.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    # Ensure it's disabled to avoid conflict with .bashrc
    if systemctl is-enabled mesophy-signage.service &>/dev/null; then
        log_message "Disabling systemd service (using .bashrc method instead)..."
        sudo systemctl disable mesophy-signage.service
    fi
else
    warning_message "Service file not found, skipping systemd installation"
fi

# Set up auto-login
log_message "Configuring auto-login..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf > /dev/null << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --noissue --autologin pi %I $TERM
Type=idle
EOF

sudo systemctl daemon-reload
sudo systemctl enable getty@tty1.service

# Configure boot to console
log_message "Configuring boot to console..."
if [[ -f /boot/config.txt ]]; then
    # Disable GUI boot
    sudo systemctl set-default multi-user.target
    
    # Ensure framebuffer is available
    if ! grep -q "dtoverlay=vc4-fkms-v3d" /boot/config.txt; then
        echo "dtoverlay=vc4-fkms-v3d" | sudo tee -a /boot/config.txt
    fi
fi

# Set up profile to auto-start signage
log_message "Configuring automatic signage startup..."
if ! grep -q "mesophy-signage" /home/pi/.bashrc; then
    cat >> /home/pi/.bashrc << 'EOF'

# Auto-start Mesophy signage on login (only on tty1)
if [[ "$(tty)" == "/dev/tty1" ]]; then
    echo "Starting Mesophy Digital Signage System..."
    /opt/mesophy/mesophy-signage
fi
EOF
fi

# Create desktop shortcut (if desktop exists)
if [[ -d "/home/pi/Desktop" ]]; then
    log_message "Creating desktop shortcuts..."
    
    cat > /home/pi/Desktop/mesophy-signage.desktop << 'EOF'
[Desktop Entry]
Name=Mesophy Signage
Comment=Digital Signage System
Exec=/usr/bin/lxterminal -e "/opt/mesophy/mesophy-signage"
Icon=display
Terminal=false
Type=Application
Categories=System;
EOF
    
    cat > /home/pi/Desktop/mesophy-status.desktop << 'EOF'
[Desktop Entry]
Name=Signage Status
Comment=Check Signage Status
Exec=/usr/bin/lxterminal -e "/opt/mesophy/mesophy-signage status; read -p 'Press Enter to close...'"
Icon=info
Terminal=false
Type=Application
Categories=System;
EOF
    
    chmod +x /home/pi/Desktop/*.desktop
fi

# Clean up log file permissions
sudo touch /var/log/mesophy-signage.log
sudo chown pi:pi /var/log/mesophy-signage.log

success_message "Installation completed successfully!"
echo
echo "Next steps:"
echo "==========="
echo "1. Reboot the Pi: sudo reboot"
echo "2. The system will auto-start and show pairing instructions"
echo "3. Add the device ID to a screen in the admin portal"
echo "4. Content will automatically start displaying"
echo
echo "Manual commands:"
echo "- Start signage: mesophy-signage"
echo "- Check status: mesophy-signage status"
echo "- View logs: mesophy-signage logs"
echo "- Show device ID: mesophy-signage device-id"
echo
echo "The system is now ready! Reboot to start the unified signage system."