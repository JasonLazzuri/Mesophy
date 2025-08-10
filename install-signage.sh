#!/bin/bash

# install-signage.sh - One-command installer for Pi Digital Signage
# Installs all dependencies and sets up the digital signage system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/pi-signage"
SERVICE_NAME="pi-signage"
USER="pi"

print_header() {
    echo -e "${BLUE}${BOLD}"
    echo "=========================================="
    echo "    Pi Digital Signage Installer"
    echo "=========================================="
    echo -e "${NC}"
    echo "This installer will set up a browser-free"
    echo "digital signage solution on your Raspberry Pi"
    echo ""
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_system() {
    log_step "Checking system requirements..."
    
    # Check if running on Linux
    if [[ "$(uname)" != "Linux" ]]; then
        log_error "This installer is designed for Linux systems"
        exit 1
    fi
    
    # Check if running as root or with sudo access
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. This is not recommended for normal operation."
    elif ! sudo -n true 2>/dev/null; then
        log_error "This script requires sudo access. Please run with sudo or ensure your user can use sudo."
        exit 1
    fi
    
    # Check if we're likely on a Raspberry Pi
    if [[ -f /proc/device-tree/model ]] && grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        local pi_model=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
        log_success "Detected: $pi_model"
    else
        log_warning "This doesn't appear to be a Raspberry Pi, but continuing anyway..."
    fi
    
    # Check available disk space (need at least 500MB)
    local available_space=$(df / | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 500000 ]]; then
        log_error "Insufficient disk space. Need at least 500MB free."
        exit 1
    fi
    
    log_success "System requirements check passed"
}

update_system() {
    log_step "Updating package repositories..."
    
    if sudo apt-get update; then
        log_success "Package repositories updated"
    else
        log_error "Failed to update package repositories"
        exit 1
    fi
}

install_dependencies() {
    log_step "Installing required dependencies..."
    
    local packages=(
        "fbi"                    # Framebuffer image viewer
        "vlc"                    # VLC media player
        "curl"                   # HTTP client
        "python3"                # Python 3
        "python3-pip"            # Python package installer
        "python3-requests"       # Python HTTP library
        "git"                    # Version control (if not already installed)
    )
    
    echo "Installing packages: ${packages[*]}"
    
    if sudo apt-get install -y "${packages[@]}"; then
        log_success "All packages installed successfully"
    else
        log_error "Failed to install some packages"
        exit 1
    fi
    
    # Install additional Python packages if needed
    log_step "Installing Python dependencies..."
    if python3 -c "import requests" 2>/dev/null; then
        log_success "Python requests library is available"
    else
        if sudo pip3 install requests; then
            log_success "Python requests library installed"
        else
            log_warning "Failed to install requests via pip, but continuing..."
        fi
    fi
}

create_install_directory() {
    log_step "Creating installation directory..."
    
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown "$USER:$USER" "$INSTALL_DIR"
    
    log_success "Created directory: $INSTALL_DIR"
}

copy_files() {
    log_step "Copying signage files..."
    
    # Get the directory where this script is located
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Copy main script
    if [[ -f "$script_dir/pi-signage.sh" ]]; then
        sudo cp "$script_dir/pi-signage.sh" "$INSTALL_DIR/"
        sudo chmod +x "$INSTALL_DIR/pi-signage.sh"
        log_success "Copied pi-signage.sh"
    else
        log_error "pi-signage.sh not found in $script_dir"
        exit 1
    fi
    
    # Copy additional files if they exist
    local optional_files=("simple-display.html" "enhanced-client.py" "launch-display-*.sh")
    
    for file_pattern in "${optional_files[@]}"; do
        if ls "$script_dir"/$file_pattern 1> /dev/null 2>&1; then
            sudo cp "$script_dir"/$file_pattern "$INSTALL_DIR/" 2>/dev/null || true
            log_success "Copied $file_pattern"
        fi
    done
    
    # Set ownership
    sudo chown -R "$USER:$USER" "$INSTALL_DIR"
}

create_systemd_service() {
    log_step "Creating systemd service..."
    
    sudo tee "/etc/systemd/system/$SERVICE_NAME.service" > /dev/null << EOF
[Unit]
Description=Pi Digital Signage Player
Documentation=https://github.com/YourRepo/pi-signage
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/pi-signage.sh start
ExecStop=$INSTALL_DIR/pi-signage.sh stop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pi-signage

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR /tmp

# Resource limits
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    sudo systemctl daemon-reload
    
    log_success "Systemd service created: $SERVICE_NAME"
}

setup_console_autologin() {
    log_step "Checking console auto-login configuration..."
    
    # This is important for FBI to work properly on console
    if systemctl is-enabled getty@tty1.service &>/dev/null; then
        log_success "Console login service is available"
        
        # Check if already configured for auto-login
        if sudo systemctl show getty@tty1.service | grep -q "ExecStart.*--autologin"; then
            log_success "Auto-login already configured"
        else
            echo "To enable console auto-login for better FBI performance:"
            echo "sudo systemctl edit getty@tty1.service"
            echo ""
            echo "Add the following content:"
            echo "[Service]"
            echo "ExecStart="
            echo "ExecStart=-/sbin/agetty --autologin $USER --noclear %I \$TERM"
            echo ""
            log_warning "Manual console auto-login configuration recommended"
        fi
    fi
}

create_wrapper_scripts() {
    log_step "Creating convenience scripts..."
    
    # Create a global command
    sudo tee "/usr/local/bin/pi-signage" > /dev/null << EOF
#!/bin/bash
exec "$INSTALL_DIR/pi-signage.sh" "\$@"
EOF
    sudo chmod +x "/usr/local/bin/pi-signage"
    
    # Create desktop shortcut if desktop environment exists
    if [[ -d "/home/$USER/Desktop" ]]; then
        tee "/home/$USER/Desktop/Pi Signage.desktop" > /dev/null << EOF
[Desktop Entry]
Name=Pi Digital Signage
Comment=Control the digital signage display
Exec=$INSTALL_DIR/pi-signage.sh status
Icon=video-display
Terminal=true
Type=Application
Categories=AudioVideo;Player;
EOF
        chmod +x "/home/$USER/Desktop/Pi Signage.desktop"
        log_success "Created desktop shortcut"
    fi
    
    log_success "Created global command: pi-signage"
}

configure_gpu_memory() {
    log_step "Checking GPU memory configuration..."
    
    if [[ -f /boot/config.txt ]]; then
        local gpu_mem=$(grep "^gpu_mem=" /boot/config.txt | cut -d'=' -f2)
        
        if [[ -z "$gpu_mem" ]] || [[ "$gpu_mem" -lt 64 ]]; then
            echo ""
            log_warning "GPU memory may be too low for optimal media playback"
            echo "Current GPU memory: ${gpu_mem:-"not set"}"
            echo "Recommended: 128 or higher for video playback"
            echo ""
            echo "To increase GPU memory, add this line to /boot/config.txt:"
            echo "gpu_mem=128"
            echo ""
            echo "Then reboot the system."
        else
            log_success "GPU memory: ${gpu_mem}MB (good for media playback)"
        fi
    fi
}

test_installation() {
    log_step "Testing installation..."
    
    # Test the main script
    if "$INSTALL_DIR/pi-signage.sh" test; then
        log_success "Pi-signage script test passed"
    else
        log_warning "Pi-signage script test failed (this may be normal if API is not reachable)"
    fi
    
    # Test systemd service
    if sudo systemctl is-enabled "$SERVICE_NAME" &>/dev/null; then
        log_success "Systemd service is properly configured"
    fi
    
    # Test global command
    if command -v pi-signage &>/dev/null; then
        log_success "Global pi-signage command is available"
    fi
}

show_next_steps() {
    echo ""
    echo -e "${GREEN}${BOLD}Installation Complete!${NC}"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo ""
    echo -e "${BLUE}1. Test the system:${NC}"
    echo "   pi-signage test"
    echo ""
    echo -e "${BLUE}2. Start the signage player:${NC}"
    echo "   pi-signage start"
    echo ""
    echo -e "${BLUE}3. Check status:${NC}"
    echo "   pi-signage status"
    echo ""
    echo -e "${BLUE}4. Enable auto-start on boot:${NC}"
    echo "   sudo systemctl enable $SERVICE_NAME"
    echo ""
    echo -e "${BLUE}5. View logs:${NC}"
    echo "   pi-signage logs"
    echo ""
    echo "Available commands:"
    echo "  start, stop, restart, status, test, logs, help"
    echo ""
    echo -e "${YELLOW}Note:${NC} This system bypasses browser issues by using"
    echo "native Linux tools (FBI for images, VLC for videos)."
    echo ""
    echo "Installation directory: $INSTALL_DIR"
    echo "Service name: $SERVICE_NAME"
    echo ""
}

# Main installation process
main() {
    print_header
    
    # Check if script is run with --help
    if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
        echo "Pi Digital Signage Installer"
        echo ""
        echo "Usage: $0 [--uninstall]"
        echo ""
        echo "Options:"
        echo "  --uninstall    Remove the digital signage system"
        echo "  --help, -h     Show this help message"
        echo ""
        exit 0
    fi
    
    # Check if script is run with --uninstall
    if [[ "${1:-}" == "--uninstall" ]]; then
        log_step "Uninstalling Pi Digital Signage..."
        
        # Stop and disable service
        sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        sudo rm -f "/etc/systemd/system/$SERVICE_NAME.service"
        sudo systemctl daemon-reload
        
        # Remove files
        sudo rm -rf "$INSTALL_DIR"
        sudo rm -f "/usr/local/bin/pi-signage"
        rm -f "/home/$USER/Desktop/Pi Signage.desktop"
        
        log_success "Pi Digital Signage uninstalled"
        exit 0
    fi
    
    echo "This will install Pi Digital Signage to: $INSTALL_DIR"
    echo "Press Enter to continue, or Ctrl+C to cancel..."
    read -r
    
    # Run installation steps
    check_system
    update_system
    install_dependencies
    create_install_directory
    copy_files
    create_systemd_service
    setup_console_autologin
    create_wrapper_scripts
    configure_gpu_memory
    test_installation
    show_next_steps
    
    echo -e "${GREEN}${BOLD}Ready to display your content!${NC}"
}

# Run main function with all arguments
main "$@"