#!/bin/bash

# Mesophy Media Daemon Installation Script
# This script installs the native media daemon on Raspberry Pi

set -e

echo "=== Mesophy Media Daemon Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run this script as root (sudo)"
    exit 1
fi

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Installing system dependencies..."

# Update package list
apt update

# Install required media players and tools
apt install -y \
    omxplayer \
    fbi \
    fim \
    vlc \
    imagemagick \
    fbset \
    alsa-utils \
    nodejs \
    npm

echo "Setting up directories..."

# Create application directories
mkdir -p /opt/mesophy/pi-client
mkdir -p /opt/mesophy/config
mkdir -p /opt/mesophy/data
mkdir -p /opt/mesophy/content
mkdir -p /opt/mesophy/logs

# Set permissions
chown -R pi:pi /opt/mesophy
chmod -R 755 /opt/mesophy

echo "Copying application files..."

# Copy daemon files (assuming script is run from pi-client directory)
cp media-daemon.js /opt/mesophy/pi-client/
cp package.json /opt/mesophy/pi-client/
cp -r lib/ /opt/mesophy/pi-client/

# Install Node.js dependencies
cd /opt/mesophy/pi-client
sudo -u pi npm install --production

echo "Setting up systemd service..."

# Copy systemd service file
cp mesophy-media-daemon.service /etc/systemd/system/

# Enable and start the service
systemctl daemon-reload
systemctl enable mesophy-media-daemon.service

echo "Configuring system for digital signage..."

# Add pi user to video and audio groups
usermod -a -G video,audio pi

# Configure framebuffer permissions
if [ -e /dev/fb0 ]; then
    chmod 666 /dev/fb0
    # Make permission change persistent
    cat > /etc/udev/rules.d/99-framebuffer.rules << 'EOF'
KERNEL=="fb[0-9]*", GROUP="video", MODE="0666"
EOF
fi

# Disable screen blanking and power management
cat > /etc/X11/xorg.conf.d/10-monitor.conf << 'EOF'
Section "ServerLayout"
    Identifier "ServerLayout0"
    Option "BlankTime" "0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime" "0"
EndSection

Section "Extensions"
    Option "DPMS" "Disable"
EndSection
EOF

# Configure auto-login (optional)
read -p "Enable auto-login for pi user? (recommended) (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    raspi-config nonint do_boot_behaviour B2
    echo "Auto-login enabled"
fi

# Disable desktop environment (optional)
read -p "Disable desktop environment to save resources? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl set-default multi-user.target
    echo "Desktop environment disabled. System will boot to console."
    echo "To re-enable: sudo systemctl set-default graphical.target"
fi

# Create startup script for console mode
cat > /home/pi/.bashrc_daemon << 'EOF'
# Auto-start media daemon if not already running
if [ -z "$SSH_CLIENT" ] && [ -z "$SSH_TTY" ]; then
    if ! systemctl is-active --quiet mesophy-media-daemon; then
        echo "Starting Mesophy Media Daemon..."
        sudo systemctl start mesophy-media-daemon
    fi
    
    # Show daemon status
    echo "=== Mesophy Digital Signage ==="
    systemctl status mesophy-media-daemon --no-pager -l
fi
EOF

# Add to .bashrc if console mode
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "source ~/.bashrc_daemon" >> /home/pi/.bashrc
fi

echo "Creating management scripts..."

# Create control script
cat > /usr/local/bin/mesophy << 'EOF'
#!/bin/bash

case "$1" in
    start)
        sudo systemctl start mesophy-media-daemon
        ;;
    stop)
        sudo systemctl stop mesophy-media-daemon
        ;;
    restart)
        sudo systemctl restart mesophy-media-daemon
        ;;
    status)
        systemctl status mesophy-media-daemon --no-pager -l
        ;;
    logs)
        journalctl -u mesophy-media-daemon -f
        ;;
    pair)
        echo "Visit https://mesophy.vercel.app to pair this device"
        journalctl -u mesophy-media-daemon -n 50 | grep -i "pairing\|code" || echo "No pairing code found. Check if device is already paired."
        ;;
    update)
        echo "Updating Mesophy daemon..."
        cd /opt/mesophy/pi-client
        sudo -u pi npm update
        sudo systemctl restart mesophy-media-daemon
        ;;
    *)
        echo "Usage: mesophy {start|stop|restart|status|logs|pair|update}"
        echo ""
        echo "  start    - Start the media daemon"
        echo "  stop     - Stop the media daemon"  
        echo "  restart  - Restart the media daemon"
        echo "  status   - Show daemon status"
        echo "  logs     - Show live logs"
        echo "  pair     - Show pairing information"
        echo "  update   - Update daemon dependencies"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/mesophy

echo ""
echo "=== Installation Complete! ==="
echo ""
echo "The Mesophy Media Daemon has been installed and configured."
echo ""
echo "Commands:"
echo "  mesophy start    - Start the daemon"
echo "  mesophy status   - Check daemon status"
echo "  mesophy logs     - View live logs"
echo "  mesophy pair     - Get pairing information"
echo ""
echo "The daemon will start automatically on boot."
echo ""

read -p "Start the daemon now? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Starting Mesophy Media Daemon..."
    systemctl start mesophy-media-daemon
    
    sleep 2
    echo ""
    echo "Daemon Status:"
    systemctl status mesophy-media-daemon --no-pager -l
    
    echo ""
    echo "If you need to pair this device:"
    echo "1. Visit https://mesophy.vercel.app"
    echo "2. Login and go to Screens"
    echo "3. Click 'Pair Device'"
    echo "4. Check pairing code with: mesophy pair"
fi

echo ""
echo "Installation complete! 🎉"