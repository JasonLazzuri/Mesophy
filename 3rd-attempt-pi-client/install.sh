#!/bin/bash
# Mesophy Pi Client Installer - 3rd Attempt
# Simple, reliable installation script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/mesophy"
SERVICE_NAME="mesophy-pi-client"
USER="pi"

# Logging
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
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check if running on Raspberry Pi
check_pi() {
    if [[ ! -f /proc/device-tree/model ]] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
        log_warning "This script is designed for Raspberry Pi but will continue anyway"
    fi
}

# Install system dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    
    apt-get update -qq
    
    # Essential packages
    apt-get install -y \
        python3 \
        python3-pip \
        python3-pil \
        fbi \
        curl \
        wget \
        git
    
    # Optional packages (don't fail if not available)
    apt-get install -y omxplayer vlc || log_warning "Video players not available on this system"
    
    # Python packages
    pip3 install requests pillow
    
    log_success "Dependencies installed"
}

# Create system directories
create_directories() {
    log_info "Creating system directories..."
    
    # Main installation directory
    mkdir -p "$INSTALL_DIR"/{config,content,logs,temp}
    
    # Set proper ownership
    chown -R $USER:$USER "$INSTALL_DIR"
    
    log_success "Directories created"
}

# Copy application files
install_application() {
    log_info "Installing Mesophy Pi Client application..."
    
    # Get the directory where this script is located
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Copy main application
    cp "$SCRIPT_DIR/pi-client.py" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/pi-client.py"
    
    # Copy library files
    cp -r "$SCRIPT_DIR/lib" "$INSTALL_DIR/"
    
    # Create default configuration
    create_default_config
    
    # Set proper ownership
    chown -R $USER:$USER "$INSTALL_DIR"
    
    log_success "Application installed"
}

# Create default configuration file
create_default_config() {
    log_info "Creating default configuration..."
    
    cat > "$INSTALL_DIR/config/client.conf" << 'EOF'
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
EOF
    
    log_success "Default configuration created"
}

# Create systemd service
create_service() {
    log_info "Creating systemd service..."
    
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Mesophy Digital Signage Pi Client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/pi-client.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    log_success "Systemd service created and enabled"
}

# Configure display settings for Pi
configure_display() {
    log_info "Configuring display settings..."
    
    # Enable framebuffer
    if ! grep -q "^dtoverlay=vc4-fkms-v3d" /boot/config.txt; then
        echo "dtoverlay=vc4-fkms-v3d" >> /boot/config.txt
    fi
    
    # Disable screen blanking
    if ! grep -q "consoleblank=0" /boot/cmdline.txt; then
        sed -i 's/$/ consoleblank=0/' /boot/cmdline.txt
    fi
    
    # Create X11 config to disable screen blanking (if X11 is used)
    mkdir -p /etc/X11/xorg.conf.d
    cat > /etc/X11/xorg.conf.d/10-monitor.conf << 'EOF'
Section "Monitor"
    Identifier "HDMI-1"
    Option "DPMS" "false"
EndSection

Section "ServerLayout"
    Identifier "ServerLayout0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime" "0"
    Option "BlankTime" "0"
EndSection
EOF
    
    log_success "Display settings configured"
}

# Set up auto-login (optional)
setup_autologin() {
    log_info "Setting up auto-login to console..."
    
    # Enable auto-login using raspi-config method
    if command -v raspi-config &> /dev/null; then
        raspi-config nonint do_boot_behaviour B2 > /dev/null 2>&1
        log_success "Auto-login configured via raspi-config"
    else
        # Manual configuration
        mkdir -p /etc/systemd/system/getty@tty1.service.d/
        cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER --noclear %I \$TERM
Type=idle
EOF
        log_success "Auto-login configured manually"
    fi
}

# Test installation
test_installation() {
    log_info "Testing installation..."
    
    # Check if main script exists and is executable
    if [[ -x "$INSTALL_DIR/pi-client.py" ]]; then
        log_success "Main application is executable"
    else
        log_error "Main application not found or not executable"
        return 1
    fi
    
    # Check if service is enabled
    if systemctl is-enabled "$SERVICE_NAME" &> /dev/null; then
        log_success "Service is enabled"
    else
        log_error "Service is not enabled"
        return 1
    fi
    
    # Test Python imports
    if python3 -c "import sys; sys.path.append('$INSTALL_DIR'); from lib.display_manager import DisplayManager; print('Import test passed')" 2>/dev/null; then
        log_success "Python imports working"
    else
        log_error "Python import test failed"
        return 1
    fi
    
    log_success "Installation test completed successfully"
}

# Main installation function
main() {
    echo "=========================================="
    echo "Mesophy Pi Client Installer - 3rd Attempt"
    echo "=========================================="
    echo
    
    check_root
    check_pi
    
    log_info "Starting installation..."
    
    install_dependencies
    create_directories
    install_application
    create_service
    configure_display
    setup_autologin
    test_installation
    
    echo
    echo "=========================================="
    log_success "Installation completed successfully!"
    echo "=========================================="
    echo
    echo "Next steps:"
    echo "1. Reboot the Pi: sudo reboot"
    echo "2. The client will start automatically and show a pairing code"
    echo "3. Go to https://mesophy.vercel.app and pair your device"
    echo
    echo "Service commands:"
    echo "- Start: sudo systemctl start $SERVICE_NAME"
    echo "- Stop: sudo systemctl stop $SERVICE_NAME"
    echo "- Status: sudo systemctl status $SERVICE_NAME"
    echo "- Logs: sudo journalctl -u $SERVICE_NAME -f"
    echo
    echo "Configuration: $INSTALL_DIR/config/client.conf"
    echo "Logs: $INSTALL_DIR/logs/pi-client.log"
    echo
}

# Run main function
main "$@"