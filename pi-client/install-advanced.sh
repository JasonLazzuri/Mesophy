#!/bin/bash

# Mesophy Digital Signage - Advanced Display Management Installation Script
# This script installs the Pi client with advanced display management capabilities

set -e

# Configuration
INSTALL_DIR="/opt/mesophy"
PI_CLIENT_DIR="$INSTALL_DIR/pi-client"
CONFIG_DIR="$INSTALL_DIR/config"
DATA_DIR="$INSTALL_DIR/data"
LOGS_DIR="$INSTALL_DIR/logs"
CONTENT_DIR="$INSTALL_DIR/content"
SERVICE_NAME="mesophy-media-daemon"

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
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check if running on Raspberry Pi
check_raspberry_pi() {
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null && ! grep -q "BCM" /proc/cpuinfo 2>/dev/null; then
        log_warning "This doesn't appear to be a Raspberry Pi. Some features may not work correctly."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Update system packages
update_system() {
    log_info "Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq
    log_success "System packages updated"
}

# Install required system packages
install_system_packages() {
    log_info "Installing required system packages..."
    
    # Base packages
    local packages=(
        "nodejs"
        "npm"
        "git"
        "curl"
        "wget"
        "unzip"
        "sqlite3"
        "ffmpeg"
        "omxplayer"
        "fbi"
        "imagemagick"
        "bc"
        "jq"
        "inotify-tools"
        "fbset"
        "v4l-utils"
    )
    
    # Raspberry Pi specific packages
    if grep -q "Raspberry Pi\|BCM" /proc/cpuinfo 2>/dev/null; then
        packages+=(
            "libraspberrypi-bin"
            "libraspberrypi-dev"
            "raspberrypi-bootloader"
            "firmware-brcm80211"
        )
    fi
    
    # Display management packages
    packages+=(
        "mesa-utils"
        "xrandr"
        "read-edid"
        "ddcutil"
    )
    
    for package in "${packages[@]}"; do
        if ! dpkg -l | grep -q "^ii.*$package "; then
            log_info "Installing $package..."
            apt-get install -y -qq "$package" || log_warning "Failed to install $package"
        fi
    done
    
    log_success "System packages installed"
}

# Create system user and directories
setup_directories() {
    log_info "Setting up directories and permissions..."
    
    # Create mesophy user if it doesn't exist
    if ! id "pi" &>/dev/null; then
        useradd -r -s /bin/false -d "$INSTALL_DIR" pi
        log_info "Created pi user"
    fi
    
    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$PI_CLIENT_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$LOGS_DIR"
    mkdir -p "$CONTENT_DIR"
    mkdir -p "$CONFIG_DIR/test-patterns"
    mkdir -p "$CONFIG_DIR/pairing-assets"
    mkdir -p "$CONFIG_DIR/backups"
    
    # Set ownership and permissions
    chown -R pi:pi "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    
    # Special permissions for framebuffer access
    usermod -a -G video pi
    usermod -a -G audio pi
    usermod -a -G dialout pi
    usermod -a -G i2c pi
    usermod -a -G spi pi
    usermod -a -G gpio pi
    
    log_success "Directories and permissions configured"
}

# Install Node.js application
install_application() {
    log_info "Installing Mesophy Pi Client application..."
    
    # Copy application files
    local script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    
    cp -r "$script_dir/"* "$PI_CLIENT_DIR/"
    
    # Install Node.js dependencies
    cd "$PI_CLIENT_DIR"
    npm install --production --silent
    
    # Make scripts executable
    chmod +x "$PI_CLIENT_DIR/media-daemon.js"
    chmod +x "$PI_CLIENT_DIR/install.sh"
    chmod +x "$PI_CLIENT_DIR/install-daemon.sh"
    
    # Set ownership
    chown -R pi:pi "$PI_CLIENT_DIR"
    
    log_success "Application installed"
}

# Configure display management
configure_display() {
    log_info "Configuring display management..."
    
    # Enable GPU memory split for video acceleration
    if grep -q "Raspberry Pi\|BCM" /proc/cpuinfo 2>/dev/null; then
        local boot_config="/boot/config.txt"
        
        # Check for Ubuntu path
        if [[ ! -f "$boot_config" && -f "/boot/firmware/config.txt" ]]; then
            boot_config="/boot/firmware/config.txt"
        fi
        
        if [[ -f "$boot_config" ]]; then
            log_info "Updating boot configuration..."
            
            # Create backup
            cp "$boot_config" "$boot_config.backup.$(date +%Y%m%d_%H%M%S)"
            
            # GPU memory configuration
            if ! grep -q "^gpu_mem=" "$boot_config"; then
                echo "# Mesophy Display Management - GPU Memory Split" >> "$boot_config"
                echo "gpu_mem=128" >> "$boot_config"
            fi
            
            # Enable DRM VC4 V3D driver
            if ! grep -q "^dtoverlay=vc4-kms-v3d" "$boot_config"; then
                echo "# Enable DRM VC4 V3D driver" >> "$boot_config"
                echo "dtoverlay=vc4-kms-v3d" >> "$boot_config"
            fi
            
            # HDMI configuration for better compatibility
            if ! grep -q "^hdmi_force_hotplug=" "$boot_config"; then
                echo "# HDMI force hotplug for display detection" >> "$boot_config"
                echo "hdmi_force_hotplug=1" >> "$boot_config"
            fi
            
            # Disable overscan by default (will be auto-configured by display manager)
            if ! grep -q "^disable_overscan=" "$boot_config"; then
                echo "# Disable overscan (will be managed by display manager)" >> "$boot_config"
                echo "disable_overscan=1" >> "$boot_config"
            fi
            
            log_success "Boot configuration updated"
        else
            log_warning "Boot config file not found - some display features may not work optimally"
        fi
    fi
    
    # Configure framebuffer permissions
    if [[ -e /dev/fb0 ]]; then
        chmod 666 /dev/fb0
        chown root:video /dev/fb0
    fi
    
    # Create udev rules for framebuffer access
    cat > /etc/udev/rules.d/99-mesophy-display.rules << 'EOF'
# Mesophy Display Management udev rules
KERNEL=="fb[0-9]*", GROUP="video", MODE="0664"
SUBSYSTEM=="drm", GROUP="video", MODE="0664"
SUBSYSTEM=="graphics", GROUP="video", MODE="0664"
EOF
    
    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    log_success "Display management configured"
}

# Install and configure systemd service
install_service() {
    log_info "Installing systemd service..."
    
    # Copy service file
    cp "$PI_CLIENT_DIR/mesophy-media-daemon.service" "/etc/systemd/system/"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable "$SERVICE_NAME"
    
    log_success "Systemd service installed and enabled"
}

# Configure automatic startup and display settings
configure_startup() {
    log_info "Configuring automatic startup..."
    
    # Disable screen blanking and power management
    cat > /etc/X11/xorg.conf.d/10-no-blank.conf << 'EOF'
Section "ServerLayout"
    Identifier "Layout0"
    Option "BlankTime" "0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime" "0"
EndSection

Section "Extensions"
    Option "DPMS" "Disable"
EndSection
EOF
    
    # Configure console blanking
    echo "consoleblank=0" >> /boot/cmdline.txt || true
    
    # Create display management helper script
    cat > /usr/local/bin/mesophy-display-helper << 'EOF'
#!/bin/bash
# Mesophy Display Management Helper Script

# Disable screen blanking
setterm -blank 0 -powerdown 0 -powersave off 2>/dev/null || true

# Disable DPMS
xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true

# Set framebuffer permissions
chmod 666 /dev/fb* 2>/dev/null || true

# Start the display manager if not running
if ! pgrep -f "mesophy-media-daemon" > /dev/null; then
    systemctl start mesophy-media-daemon
fi
EOF
    
    chmod +x /usr/local/bin/mesophy-display-helper
    
    # Add to rc.local for early execution
    if [[ -f /etc/rc.local ]]; then
        if ! grep -q "mesophy-display-helper" /etc/rc.local; then
            sed -i '/^exit 0/i /usr/local/bin/mesophy-display-helper' /etc/rc.local
        fi
    fi
    
    log_success "Automatic startup configured"
}

# Create desktop shortcut for manual control
create_desktop_shortcuts() {
    log_info "Creating desktop shortcuts..."
    
    # Create applications directory
    mkdir -p /usr/share/applications
    
    # Create desktop file for manual control
    cat > /usr/share/applications/mesophy-control.desktop << 'EOF'
[Desktop Entry]
Name=Mesophy Digital Signage Control
Comment=Control Mesophy Digital Signage Display
Exec=lxterminal -e "sudo systemctl status mesophy-media-daemon"
Icon=display
Terminal=false
Type=Application
Categories=System;Settings;
EOF
    
    # Create desktop file for display calibration
    cat > /usr/share/applications/mesophy-display-calibration.desktop << 'EOF'
[Desktop Entry]
Name=Mesophy Display Calibration
Comment=Calibrate Mesophy Digital Signage Display
Exec=lxterminal -e "cd /opt/mesophy/pi-client && sudo -u pi node -e \"const DisplayConfig = require('./lib/display-config'); const config = new DisplayConfig(); config.initialize().then(() => config.startCalibrationWizard())\""
Icon=preferences-desktop-display
Terminal=false
Type=Application
Categories=System;Settings;
EOF
    
    log_success "Desktop shortcuts created"
}

# Run system optimization
optimize_system() {
    log_info "Optimizing system for digital signage..."
    
    # Increase GPU memory split for Pi 4
    if grep -q "Pi 4" /proc/cpuinfo 2>/dev/null; then
        if grep -q "^gpu_mem=" /boot/config.txt 2>/dev/null; then
            sed -i 's/^gpu_mem=.*/gpu_mem=256/' /boot/config.txt
        elif grep -q "^gpu_mem=" /boot/firmware/config.txt 2>/dev/null; then
            sed -i 's/^gpu_mem=.*/gpu_mem=256/' /boot/firmware/config.txt
        fi
    fi
    
    # Configure log rotation for application logs
    cat > /etc/logrotate.d/mesophy << 'EOF'
/opt/mesophy/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    create 0644 pi pi
    postrotate
        systemctl reload mesophy-media-daemon || true
    endscript
}
EOF
    
    # Set system timezone to UTC for consistent scheduling
    timedatectl set-timezone UTC
    
    # Optimize network settings for media streaming
    echo "net.core.rmem_max = 16777216" >> /etc/sysctl.conf
    echo "net.core.wmem_max = 16777216" >> /etc/sysctl.conf
    echo "net.ipv4.tcp_rmem = 4096 87380 16777216" >> /etc/sysctl.conf
    echo "net.ipv4.tcp_wmem = 4096 65536 16777216" >> /etc/sysctl.conf
    
    log_success "System optimization completed"
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    local errors=0
    
    # Check if service is enabled
    if ! systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
        log_error "Service is not enabled"
        errors=$((errors + 1))
    fi
    
    # Check if directories exist
    local dirs=("$INSTALL_DIR" "$PI_CLIENT_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOGS_DIR" "$CONTENT_DIR")
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            log_error "Directory missing: $dir"
            errors=$((errors + 1))
        fi
    done
    
    # Check if Node.js modules are installed
    if [[ ! -d "$PI_CLIENT_DIR/node_modules" ]]; then
        log_error "Node.js modules not installed"
        errors=$((errors + 1))
    fi
    
    # Check framebuffer access
    if [[ ! -c /dev/fb0 ]]; then
        log_warning "Framebuffer not available - display features may be limited"
    fi
    
    if [[ $errors -eq 0 ]]; then
        log_success "Installation verification completed successfully"
        return 0
    else
        log_error "Installation verification failed with $errors errors"
        return 1
    fi
}

# Display final instructions
show_final_instructions() {
    echo
    log_success "Mesophy Digital Signage Advanced Display Management installation completed!"
    echo
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Reboot the system to ensure all changes take effect:"
    echo "   sudo reboot"
    echo
    echo "2. After reboot, the service will start automatically and show a pairing screen"
    echo
    echo "3. Go to your Mesophy dashboard to pair this device:"
    echo "   https://mesophy.vercel.app/dashboard/devices/pair"
    echo
    echo -e "${BLUE}Service Management:${NC}"
    echo "• Start service:   sudo systemctl start $SERVICE_NAME"
    echo "• Stop service:    sudo systemctl stop $SERVICE_NAME"
    echo "• Restart service: sudo systemctl restart $SERVICE_NAME"
    echo "• Check status:    sudo systemctl status $SERVICE_NAME"
    echo "• View logs:       sudo journalctl -u $SERVICE_NAME -f"
    echo
    echo -e "${BLUE}Display Management:${NC}"
    echo "• Display calibration can be run from the desktop shortcuts"
    echo "• Configuration files are stored in: $CONFIG_DIR"
    echo "• Test patterns are available in: $CONFIG_DIR/test-patterns"
    echo
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "• If display issues occur, check: sudo journalctl -u $SERVICE_NAME"
    echo "• For advanced configuration, edit files in: $CONFIG_DIR"
    echo "• Display profiles can be customized via the display-config system"
    echo
    if [[ -c /dev/fb0 ]]; then
        log_success "Framebuffer detected - full display management features available"
    else
        log_warning "Framebuffer not detected - some display features may be limited"
    fi
}

# Main installation function
main() {
    echo
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}Mesophy Digital Signage Advanced Installation${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo
    
    check_root
    check_raspberry_pi
    
    log_info "Starting installation process..."
    
    update_system
    install_system_packages
    setup_directories
    install_application
    configure_display
    install_service
    configure_startup
    create_desktop_shortcuts
    optimize_system
    
    if verify_installation; then
        show_final_instructions
        exit 0
    else
        log_error "Installation completed with errors. Please check the logs above."
        exit 1
    fi
}

# Run installation if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi