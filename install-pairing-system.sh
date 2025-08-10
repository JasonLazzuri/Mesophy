#!/bin/bash

# install-pairing-system.sh - Install Mesophy Digital Signage with Device Pairing
# This script installs the enhanced Pi signage client with dynamic device pairing

set -euo pipefail

# Configuration
INSTALL_DIR="/opt/mesophy"
SCRIPT_NAME="pi-signage.sh"
SERVICE_NAME="mesophy-signage"
PI_USER="pi"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success_message() {
    echo -e "${GREEN}✓${NC} $1"
}

error_message() {
    echo -e "${RED}✗${NC} $1" >&2
}

warning_message() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_message "This script must be run as root (use sudo)"
        exit 1
    fi
}

install_dependencies() {
    log_message "Installing required dependencies..."
    
    # Update package list
    apt-get update
    
    # Install core dependencies
    local packages=(
        "fbi"              # Framebuffer image viewer
        "vlc"              # Video player
        "curl"             # HTTP client
        "python3"          # Python runtime
        "python3-pip"      # Python package manager
        "python3-pil"      # Python Imaging Library
        "python3-requests" # HTTP requests library
        "imagemagick"      # Image manipulation (optional)
        "qrencode"         # QR code generation (optional)
    )
    
    for package in "${packages[@]}"; do
        if dpkg -l | grep -q "^ii.*$package "; then
            log_message "$package is already installed"
        else
            log_message "Installing $package..."
            apt-get install -y "$package" || warning_message "Failed to install $package"
        fi
    done
    
    success_message "Dependencies installed"
}

create_directories() {
    log_message "Creating installation directories..."
    
    # Create main directories
    mkdir -p "$INSTALL_DIR"/{bin,config,logs,temp,scripts}
    
    # Set proper ownership
    chown -R "$PI_USER:$PI_USER" "$INSTALL_DIR"
    
    success_message "Directories created"
}

install_scripts() {
    log_message "Installing signage scripts..."
    
    local script_dir="$(dirname "$0")"
    
    # Copy main signage script
    if [[ -f "$script_dir/$SCRIPT_NAME" ]]; then
        cp "$script_dir/$SCRIPT_NAME" "$INSTALL_DIR/bin/"
        chmod +x "$INSTALL_DIR/bin/$SCRIPT_NAME"
        success_message "Main signage script installed"
    else
        error_message "Main signage script not found: $script_dir/$SCRIPT_NAME"
        exit 1
    fi
    
    # Copy device ID script
    if [[ -f "$script_dir/pi-device-id.sh" ]]; then
        cp "$script_dir/pi-device-id.sh" "$INSTALL_DIR/bin/"
        chmod +x "$INSTALL_DIR/bin/pi-device-id.sh"
        success_message "Device ID script installed"
    else
        warning_message "Device ID script not found, using built-in fallback"
    fi
    
    # Copy pairing instructions script
    if [[ -f "$script_dir/show-pairing-instructions.sh" ]]; then
        cp "$script_dir/show-pairing-instructions.sh" "$INSTALL_DIR/bin/"
        chmod +x "$INSTALL_DIR/bin/show-pairing-instructions.sh"
        success_message "Pairing instructions script installed"
    else
        warning_message "Pairing instructions script not found, using built-in fallback"
    fi
    
    # Set ownership
    chown -R "$PI_USER:$PI_USER" "$INSTALL_DIR"
}

create_systemd_service() {
    log_message "Creating systemd service..."
    
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Mesophy Digital Signage Player
After=network.target
Wants=network.target

[Service]
Type=simple
User=$PI_USER
Group=$PI_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/bin/$SCRIPT_NAME start
ExecStop=$INSTALL_DIR/bin/$SCRIPT_NAME stop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=DISPLAY=:0.0
Environment=HOME=/home/$PI_USER

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    success_message "Systemd service created and enabled"
}

create_convenience_links() {
    log_message "Creating convenience links..."
    
    # Create symlink in PATH
    ln -sf "$INSTALL_DIR/bin/$SCRIPT_NAME" "/usr/local/bin/mesophy-signage"
    ln -sf "$INSTALL_DIR/bin/pi-device-id.sh" "/usr/local/bin/mesophy-device-id"
    
    success_message "Convenience links created"
}

setup_auto_login() {
    log_message "Setting up auto-login and display configuration..."
    
    # Enable auto-login for pi user
    systemctl set-default multi-user.target
    systemctl enable getty@tty1.service
    
    # Configure auto-login
    mkdir -p /etc/systemd/system/getty@tty1.service.d
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $PI_USER --noclear %I \$TERM
EOF
    
    success_message "Auto-login configured"
}

configure_boot_options() {
    log_message "Configuring boot options..."
    
    # Update /boot/config.txt for optimal display
    local config_file="/boot/config.txt"
    if [[ ! -f "$config_file" ]]; then
        config_file="/boot/firmware/config.txt"
    fi
    
    if [[ -f "$config_file" ]]; then
        # Backup original config
        cp "$config_file" "${config_file}.backup"
        
        # Add/update display settings
        cat >> "$config_file" << EOF

# Mesophy Digital Signage Configuration
# Added by install-pairing-system.sh
hdmi_force_hotplug=1
hdmi_group=1
hdmi_mode=16
disable_overscan=1
EOF
        
        success_message "Boot configuration updated"
    else
        warning_message "Boot config file not found, skipping display configuration"
    fi
}

show_next_steps() {
    echo ""
    echo "================================================"
    echo -e "${GREEN}🎉 Installation Complete!${NC}"
    echo "================================================"
    echo ""
    echo "The Mesophy Digital Signage system has been installed with device pairing support."
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Get your device ID:"
    echo "   mesophy-device-id"
    echo ""
    echo "2. Open the Mesophy admin portal and pair this device:"
    echo "   https://mesophy.vercel.app"
    echo "   → Dashboard → Screens → Add New Screen"
    echo ""
    echo "3. Start the signage service:"
    echo "   sudo systemctl start $SERVICE_NAME"
    echo ""
    echo "4. Check service status:"
    echo "   mesophy-signage status"
    echo ""
    echo "5. View logs:"
    echo "   mesophy-signage logs"
    echo "   journalctl -u $SERVICE_NAME -f"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  mesophy-signage start      # Start signage display"
    echo "  mesophy-signage stop       # Stop signage display"
    echo "  mesophy-signage status     # Show status and pairing info"
    echo "  mesophy-signage pair       # Check pairing status"
    echo "  mesophy-device-id          # Show device ID"
    echo "  sudo systemctl start $SERVICE_NAME    # Start as service"
    echo "  sudo systemctl enable $SERVICE_NAME   # Auto-start on boot"
    echo ""
    echo -e "${GREEN}Installation Directory:${NC} $INSTALL_DIR"
    echo -e "${GREEN}Service Name:${NC} $SERVICE_NAME"
    echo ""
    
    local device_id
    if device_id=$("$INSTALL_DIR/bin/pi-device-id.sh" get 2>/dev/null); then
        echo -e "${YELLOW}Your Device ID:${NC} $device_id"
        echo ""
    fi
    
    echo "================================================"
}

# Main installation process
main() {
    echo ""
    echo "================================================"
    echo "  Mesophy Digital Signage - Pairing System"
    echo "================================================"
    echo ""
    
    check_root
    
    log_message "Starting installation..."
    
    install_dependencies
    create_directories
    install_scripts
    create_systemd_service
    create_convenience_links
    setup_auto_login
    configure_boot_options
    
    show_next_steps
    
    echo ""
    log_message "Installation completed successfully!"
    echo ""
    echo "Reboot recommended to apply all changes."
    echo "After reboot, the signage service will start automatically."
    echo ""
}

# Run installation
main "$@"