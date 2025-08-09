#!/bin/bash
# Mesophy Digital Signage Kiosk Installer
# Professional browser-based kiosk system that auto-launches on boot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installation paths
INSTALL_DIR="/opt/mesophy"
SERVICE_NAME="mesophy-kiosk"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Logging function
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Display banner
show_banner() {
    echo -e "${BLUE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════╗
║                  MESOPHY KIOSK INSTALLER                 ║
║                                                          ║
║  Professional Browser-Based Digital Signage System      ║
║  • Auto-launches on Pi boot                             ║
║  • Zero manual configuration required                   ║
║  • Professional web-based interface                     ║
║  • Offline capabilities with Service Workers            ║
║  • Hardware-accelerated video playback                  ║
╚══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Check system requirements
check_requirements() {
    log_step "Checking system requirements..."
    
    # Check if we're on Raspberry Pi OS
    if ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        log_warn "This doesn't appear to be a Raspberry Pi - proceeding anyway"
    fi
    
    # Check for required commands
    local missing_deps=()
    
    for cmd in curl wget systemctl; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required commands: ${missing_deps[*]}"
        exit 1
    fi
    
    log_info "System requirements check passed"
}

# Update system packages
update_system() {
    log_step "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y > /dev/null 2>&1
    log_info "Package lists updated"
}

# Install Node.js
install_nodejs() {
    log_step "Installing Node.js..."
    
    if command -v node &> /dev/null; then
        local node_version=$(node --version | cut -d'v' -f2)
        log_info "Node.js already installed: v$node_version"
        
        # Check if version is acceptable (16+)
        if [[ $(echo "$node_version" | cut -d'.' -f1) -ge 16 ]]; then
            return 0
        else
            log_warn "Node.js version is too old, upgrading..."
        fi
    fi
    
    # Install Node.js 18.x LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
    
    local installed_version=$(node --version)
    log_info "Node.js installed: $installed_version"
}

# Install Chromium browser
install_chromium() {
    log_step "Installing Chromium browser..."
    
    if command -v chromium-browser &> /dev/null; then
        log_info "Chromium browser already installed"
        return 0
    fi
    
    # Try different package names
    if apt-get install -y chromium-browser > /dev/null 2>&1; then
        log_info "Chromium browser installed"
    elif apt-get install -y chromium > /dev/null 2>&1; then
        log_info "Chromium installed"
    else
        log_error "Failed to install Chromium browser"
        exit 1
    fi
}

# Install system dependencies
install_dependencies() {
    log_step "Installing system dependencies..."
    
    local packages=(
        build-essential
        python3-dev
        libnss3-dev
        libatk-bridge2.0-dev
        libdrm-dev
        libxrandr-dev
        libxcomposite-dev
        libxdamage-dev
        libxss-dev
        libgconf2-dev
        libxfixes-dev
        xvfb
        x11-xserver-utils
        unclutter
        sqlite3
        curl
        wget
        git
    )
    
    apt-get install -y "${packages[@]}" > /dev/null 2>&1
    log_info "System dependencies installed"
}

# Create installation directory and copy files
setup_application() {
    log_step "Setting up application files..."
    
    # Create directories
    mkdir -p "$INSTALL_DIR"/{logs,data,config,content}
    
    # Copy application files
    if [[ -f "kiosk-server.js" ]]; then
        cp -r kiosk-server.js kiosk-app/ start-kiosk.sh mesophy-kiosk.service package.json "$INSTALL_DIR/"
        
        # Make scripts executable
        chmod +x "$INSTALL_DIR/start-kiosk.sh"
        
        log_info "Application files copied"
    else
        log_error "Application files not found in current directory"
        log_error "Please run this installer from the pi-client directory"
        exit 1
    fi
    
    # Set proper permissions
    chown -R pi:pi "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    
    log_info "Directory permissions set"
}

# Install Node.js dependencies
install_npm_dependencies() {
    log_step "Installing Node.js dependencies..."
    
    cd "$INSTALL_DIR"
    
    # Install as pi user to avoid permission issues
    sudo -u pi npm install > /dev/null 2>&1
    
    log_info "Node.js dependencies installed"
}

# Configure Chromium for kiosk mode
configure_chromium() {
    log_step "Configuring Chromium for kiosk mode..."
    
    local pi_home="/home/pi"
    local chromium_config_dir="$pi_home/.config/chromium/Default"
    
    # Create Chromium config directory
    sudo -u pi mkdir -p "$chromium_config_dir"
    
    # Create Chromium preferences for kiosk mode
    sudo -u pi tee "$chromium_config_dir/Preferences" > /dev/null << 'EOF'
{
   "profile": {
      "default_content_setting_values": {
         "notifications": 2,
         "geolocation": 2,
         "media_stream": 2
      },
      "exit_type": "Normal",
      "exited_cleanly": true
   },
   "browser": {
      "check_default_browser": false,
      "show_home_button": false
   },
   "distribution": {
      "skip_first_run_ui": true,
      "import_bookmarks": false,
      "import_history": false,
      "import_search_engine": false,
      "make_chrome_default_for_user": false,
      "do_not_create_any_shortcuts": true,
      "do_not_create_taskbar_shortcut": true,
      "do_not_create_desktop_shortcut": true
   }
}
EOF
    
    log_info "Chromium configured for kiosk mode"
}

# Install and configure systemd service
install_service() {
    log_step "Installing systemd service..."
    
    # Copy service file
    cp "$INSTALL_DIR/mesophy-kiosk.service" "$SERVICE_FILE"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable the service
    systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
    
    log_info "Systemd service installed and enabled"
}

# Configure auto-login for pi user
configure_autologin() {
    log_step "Configuring auto-login..."
    
    # Enable auto-login for pi user
    if [[ -f "/etc/systemd/system/getty@tty1.service.d/autologin.conf" ]]; then
        log_info "Auto-login already configured"
        return 0
    fi
    
    mkdir -p /etc/systemd/system/getty@tty1.service.d/
    
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I $TERM
EOF
    
    log_info "Auto-login configured for pi user"
}

# Configure X11 auto-start
configure_x11_autostart() {
    log_step "Configuring X11 auto-start..."
    
    local pi_home="/home/pi"
    local bashrc_file="$pi_home/.bashrc"
    
    # Add X11 auto-start to .bashrc if not already present
    if ! grep -q "startx" "$bashrc_file"; then
        sudo -u pi cat >> "$bashrc_file" << 'EOF'

# Auto-start X11 for Mesophy Kiosk (only on tty1)
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]] && [[ -z $XDG_SESSION_TYPE ]]; then
    exec startx -- -nocursor
fi
EOF
        log_info "X11 auto-start configured"
    else
        log_info "X11 auto-start already configured"
    fi
}

# Configure unclutter (hide mouse cursor)
configure_unclutter() {
    log_step "Configuring cursor hiding..."
    
    # Create unclutter service
    cat > /etc/systemd/user/unclutter.service << 'EOF'
[Unit]
Description=Hide mouse cursor
After=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/unclutter -idle 1 -root
Restart=always

[Install]
WantedBy=graphical-session.target
EOF
    
    # Enable for pi user
    sudo -u pi systemctl --user enable unclutter > /dev/null 2>&1
    
    log_info "Cursor hiding configured"
}

# Final configuration and cleanup
finalize_installation() {
    log_step "Finalizing installation..."
    
    # Create a simple test to verify installation
    cat > "$INSTALL_DIR/test-kiosk.sh" << 'EOF'
#!/bin/bash
echo "Testing Mesophy Kiosk installation..."
echo "Node.js version: $(node --version)"
echo "Chromium available: $(command -v chromium-browser >/dev/null && echo "Yes" || echo "No")"
echo "Service status: $(systemctl is-enabled mesophy-kiosk 2>/dev/null || echo "Not found")"
echo "Installation directory: $INSTALL_DIR"
echo "Files present: $(ls -la $INSTALL_DIR/ | wc -l) items"
EOF
    
    chmod +x "$INSTALL_DIR/test-kiosk.sh"
    
    # Set up log rotation
    cat > /etc/logrotate.d/mesophy-kiosk << 'EOF'
/opt/mesophy/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    copytruncate
}
EOF
    
    log_info "Installation finalized"
}

# Display installation summary
show_summary() {
    echo
    log_info "🎉 Installation completed successfully!"
    echo
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    INSTALLATION SUMMARY                 ║${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║${NC} Installation Directory: ${GREEN}$INSTALL_DIR${NC}"
    echo -e "${BLUE}║${NC} Service Name: ${GREEN}$SERVICE_NAME${NC}"
    echo -e "${BLUE}║${NC} Auto-start: ${GREEN}Enabled${NC}"
    echo -e "${BLUE}║${NC} Browser: ${GREEN}Chromium Kiosk Mode${NC}"
    echo -e "${BLUE}║${NC} User: ${GREEN}pi${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║${NC} ${YELLOW}NEXT STEPS:${NC}"
    echo -e "${BLUE}║${NC} 1. Reboot the Pi: ${GREEN}sudo reboot${NC}"
    echo -e "${BLUE}║${NC} 2. The kiosk will auto-start and show pairing code"
    echo -e "${BLUE}║${NC} 3. Go to mesophy.vercel.app to pair the device"
    echo -e "${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} ${YELLOW}MANAGEMENT COMMANDS:${NC}"
    echo -e "${BLUE}║${NC} • Check status: ${GREEN}sudo systemctl status $SERVICE_NAME${NC}"
    echo -e "${BLUE}║${NC} • View logs: ${GREEN}sudo journalctl -u $SERVICE_NAME -f${NC}"
    echo -e "${BLUE}║${NC} • Restart: ${GREEN}sudo systemctl restart $SERVICE_NAME${NC}"
    echo -e "${BLUE}║${NC} • Test install: ${GREEN}$INSTALL_DIR/test-kiosk.sh${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo
}

# Main installation function
main() {
    show_banner
    
    check_root
    check_requirements
    update_system
    install_nodejs
    install_chromium
    install_dependencies
    setup_application
    install_npm_dependencies
    configure_chromium
    install_service
    configure_autologin
    configure_x11_autostart
    configure_unclutter
    finalize_installation
    
    show_summary
}

# Run main function
main "$@"