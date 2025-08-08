#!/bin/bash

# Mesophy Pi Client Uninstaller Script
# Usage: sudo ./uninstall.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/mesophy"
SERVICE_NAMES=("mesophy-client" "mesophy-media-daemon")
USER="pi"

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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Banner
echo -e "${CYAN}"
cat << "EOF"
  __  __                       _            
 |  \/  | ___  ___  ___  _ __ | |__  _   _  
 | |\/| |/ _ \/ __|/ _ \| '_ \| '_ \| | | | 
 | |  | |  __/\__ \ (_) | |_) | | | | |_| | 
 |_|  |_|\___||___/\___/| .__/|_| |_|\__, | 
                        |_|          |___/  
 
   🗑️ Mesophy Pi Client Uninstaller 🗑️
EOF
echo -e "${NC}"

log_warning "This will completely remove all Mesophy installations from this Pi"
echo -e "${YELLOW}This action cannot be undone!${NC}"
echo
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Uninstall cancelled"
    exit 0
fi

log_info "Starting Mesophy Pi Client uninstallation..."

# Step 1: Stop and disable all Mesophy services
log_step "1/7 Stopping and disabling Mesophy services..."

for service in "${SERVICE_NAMES[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        log_info "Stopping service: $service"
        systemctl stop "$service" || log_warning "Failed to stop $service"
    fi
    
    if systemctl is-enabled --quiet "$service" 2>/dev/null; then
        log_info "Disabling service: $service"
        systemctl disable "$service" || log_warning "Failed to disable $service"
    fi
    
    # Remove service file
    if [[ -f "/etc/systemd/system/$service.service" ]]; then
        log_info "Removing service file: $service.service"
        rm -f "/etc/systemd/system/$service.service"
    fi
done

# Reload systemd
systemctl daemon-reload
log_success "Services stopped and disabled"

# Step 2: Kill any running Mesophy processes
log_step "2/7 Terminating any running Mesophy processes..."

# Kill Node.js processes running Mesophy apps
pkill -f "mesophy" || log_info "No Mesophy processes found"
pkill -f "media-daemon" || log_info "No media-daemon processes found"

# Kill any remaining media players that might be running
pkill -f "omxplayer" || log_info "No omxplayer processes found"
pkill -f "vlc.*mesophy" || log_info "No VLC processes found"
pkill -f "fbi.*mesophy" || log_info "No fbi processes found"

sleep 2
log_success "Processes terminated"

# Step 3: Remove installation directory
log_step "3/7 Removing installation directory..."

if [[ -d "$INSTALL_DIR" ]]; then
    log_info "Removing: $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
    log_success "Installation directory removed"
else
    log_info "Installation directory not found"
fi

# Step 4: Remove management commands
log_step "4/7 Removing management commands..."

COMMANDS=("mesophy-status" "mesophy-logs" "mesophy-restart")
for cmd in "${COMMANDS[@]}"; do
    if [[ -f "/usr/local/bin/$cmd" ]]; then
        log_info "Removing command: $cmd"
        rm -f "/usr/local/bin/$cmd"
    fi
done

log_success "Management commands removed"

# Step 5: Clean up system configuration
log_step "5/7 Cleaning up system configuration..."

# Remove GPU memory configuration (if we added it)
if grep -q "# Mesophy GPU memory split" /boot/config.txt; then
    log_info "Removing GPU memory configuration from /boot/config.txt"
    sed -i '/# Mesophy GPU memory split/d' /boot/config.txt
    sed -i '/gpu_mem=128/d' /boot/config.txt
    sed -i '/gpu_mem_1024=128/d' /boot/config.txt
fi

# Remove console blank configuration (if we added it)
if grep -q "consoleblank=0" /boot/cmdline.txt; then
    log_warning "Found consoleblank=0 in /boot/cmdline.txt - you may want to remove this manually"
fi

# Remove framebuffer environment variable
if grep -q "FRAMEBUFFER=/dev/fb0" /etc/environment; then
    log_info "Removing framebuffer configuration from /etc/environment"
    sed -i '/FRAMEBUFFER=\/dev\/fb0/d' /etc/environment
fi

log_success "System configuration cleaned up"

# Step 6: Remove user from groups (optional)
log_step "6/7 Cleaning up user permissions..."

# Note: We don't remove user from standard groups like video, audio, etc.
# as they might be needed for other applications
log_info "User group memberships left unchanged (may be used by other applications)"

# Step 7: Clean up logs and temporary files
log_step "7/7 Cleaning up logs and temporary files..."

# Remove any Mesophy-related logs
if [[ -d "/var/log/mesophy" ]]; then
    rm -rf "/var/log/mesophy"
    log_info "Removed /var/log/mesophy"
fi

# Clean up systemd logs for Mesophy services
for service in "${SERVICE_NAMES[@]}"; do
    journalctl --vacuum-time=1s --unit="$service" 2>/dev/null || true
done

# Remove any temporary Mesophy files
rm -rf /tmp/mesophy* 2>/dev/null || true
rm -rf /tmp/*mesophy* 2>/dev/null || true

log_success "Cleanup completed"

echo
echo -e "${GREEN}🎉 Mesophy Pi Client Uninstallation Complete! 🎉${NC}"
echo
echo -e "${CYAN}Summary of actions performed:${NC}"
echo "  ✅ Stopped and disabled all Mesophy services"
echo "  ✅ Terminated running Mesophy processes"  
echo "  ✅ Removed installation directory ($INSTALL_DIR)"
echo "  ✅ Removed management commands"
echo "  ✅ Cleaned up system configuration"
echo "  ✅ Removed logs and temporary files"
echo
echo -e "${CYAN}System status:${NC}"
echo "  • All Mesophy components removed"
echo "  • Pi returned to clean state"
echo "  • No reboot required"
echo
echo -e "${YELLOW}Note:${NC} System packages (Node.js, omxplayer, VLC, etc.) were left installed"
echo -e "${YELLOW}      as they may be used by other applications.${NC}"

# Optional: Offer to remove system packages
echo
echo -e "${BLUE}Would you also like to remove the media player packages? (y/N)${NC}"
echo -e "${YELLOW}Warning: This will remove Node.js, VLC, omxplayer, and related packages${NC}"
read -p "Remove media packages? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_step "Removing media player packages..."
    
    # Remove packages that were installed for Mesophy
    apt-get remove -y \
        omxplayer \
        vlc \
        fbi \
        fim \
        fbset \
        fbcat \
        imagemagick \
        qrencode \
        console-tools 2>/dev/null || log_warning "Some packages couldn't be removed"
    
    # Ask about Node.js specifically
    echo
    read -p "Also remove Node.js? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        apt-get remove -y nodejs npm 2>/dev/null || log_warning "Node.js removal failed"
        log_success "Node.js removed"
    fi
    
    # Clean up unused packages
    apt-get autoremove -y 2>/dev/null || true
    
    log_success "Media packages removed"
fi

echo
log_success "Uninstallation completed successfully!"
log_info "Your Raspberry Pi is now clean of all Mesophy components."

# Final status check
echo
echo -e "${CYAN}Final verification:${NC}"
if [[ ! -d "$INSTALL_DIR" ]]; then
    echo -e "${GREEN}✅ Installation directory: REMOVED${NC}"
else
    echo -e "${RED}❌ Installation directory: STILL EXISTS${NC}"
fi

SERVICE_RUNNING=false
for service in "${SERVICE_NAMES[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "${RED}❌ Service $service: STILL RUNNING${NC}"
        SERVICE_RUNNING=true
    fi
done

if [[ "$SERVICE_RUNNING" == false ]]; then
    echo -e "${GREEN}✅ Mesophy services: ALL STOPPED${NC}"
fi

if pgrep -f "mesophy\|media-daemon" > /dev/null; then
    echo -e "${RED}❌ Mesophy processes: STILL RUNNING${NC}"
else
    echo -e "${GREEN}✅ Mesophy processes: ALL TERMINATED${NC}"
fi

echo
echo -e "${GREEN}🧹 Your Pi is now completely clean! 🧹${NC}"