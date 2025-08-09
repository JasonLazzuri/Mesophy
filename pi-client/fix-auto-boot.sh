#!/bin/bash
# Fix auto-login and auto-start issues for Mesophy Kiosk

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

log_info "🔧 Fixing Mesophy Kiosk auto-boot issues..."

# Fix 1: Configure proper auto-login using raspi-config method
log_info "1. Fixing auto-login configuration..."

# Enable auto-login using the Pi's preferred method
if command -v raspi-config &> /dev/null; then
    # Use raspi-config to enable auto-login (non-interactive)
    raspi-config nonint do_boot_behaviour B2 > /dev/null 2>&1
    log_info "✅ Auto-login enabled via raspi-config"
else
    # Manual configuration for systems without raspi-config
    log_warn "raspi-config not found, using manual configuration"
    
    # Create/update the autologin service override
    mkdir -p /etc/systemd/system/getty@tty1.service.d/
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I $TERM
Type=idle
EOF
    
    # Also update the console-setup if it exists
    if [[ -f /etc/default/console-setup ]]; then
        sed -i 's/#*CHARMAP=.*/CHARMAP="UTF-8"/' /etc/default/console-setup
    fi
    
    log_info "✅ Manual auto-login configured"
fi

# Fix 2: Configure desktop auto-start instead of .bashrc
log_info "2. Configuring desktop auto-start..."

# Remove the .bashrc modification (it's unreliable)
sudo -u pi sed -i '/Auto-start X11 for Mesophy Kiosk/,+4d' /home/pi/.bashrc 2>/dev/null || true

# Create proper autostart desktop entry
sudo -u pi mkdir -p /home/pi/.config/autostart
sudo -u pi tee /home/pi/.config/autostart/mesophy-kiosk.desktop > /dev/null << 'EOF'
[Desktop Entry]
Type=Application
Name=Mesophy Kiosk
Comment=Mesophy Digital Signage Kiosk Application
Exec=/opt/mesophy/start-kiosk.sh
Icon=applications-internet
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF

log_info "✅ Desktop autostart entry created"

# Fix 3: Ensure Pi boots to desktop (not CLI)
log_info "3. Configuring boot to desktop..."

if command -v raspi-config &> /dev/null; then
    # Boot to desktop with auto-login
    raspi-config nonint do_boot_behaviour B4 > /dev/null 2>&1
    log_info "✅ Boot to desktop configured via raspi-config"
else
    # Manual systemd target change
    systemctl set-default graphical.target > /dev/null 2>&1
    log_info "✅ Boot to desktop configured manually"
fi

# Fix 4: Alternative direct service approach
log_info "4. Creating direct service alternative..."

# Create a user service that starts with the desktop
sudo -u pi mkdir -p /home/pi/.config/systemd/user
sudo -u pi tee /home/pi/.config/systemd/user/mesophy-kiosk-desktop.service > /dev/null << 'EOF'
[Unit]
Description=Mesophy Kiosk Desktop Launcher
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
ExecStartPre=/bin/bash -c 'while ! pgrep -x lxsession > /dev/null; do sleep 2; done'
ExecStart=/opt/mesophy/start-kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Enable the user service
sudo -u pi systemctl --user daemon-reload
sudo -u pi systemctl --user enable mesophy-kiosk-desktop.service > /dev/null 2>&1

# Enable lingering for pi user so services start at boot
loginctl enable-linger pi > /dev/null 2>&1

log_info "✅ User service created and enabled"

# Fix 5: Update the start script to be more reliable
log_info "5. Updating start script for better reliability..."

# Make a backup of the original
cp /opt/mesophy/start-kiosk.sh /opt/mesophy/start-kiosk.sh.backup

# Create improved start script
tee /opt/mesophy/start-kiosk.sh > /dev/null << 'EOF'
#!/bin/bash
# Improved Mesophy Kiosk Launcher - More reliable startup

set -e

MESOPHY_DIR="/opt/mesophy"
LOG_FILE="$MESOPHY_DIR/logs/kiosk-launcher.log"
PID_FILE="$MESOPHY_DIR/kiosk.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "🚀 Starting Mesophy Kiosk (Improved Launcher)"

# Wait for desktop environment to be ready
log "⏳ Waiting for desktop environment..."
timeout=60
while ! pgrep -x "lxsession\|gnome-session\|xfce4-session" > /dev/null; do
    if [[ $timeout -le 0 ]]; then
        log "⚠️ Desktop environment timeout - starting anyway"
        break
    fi
    sleep 2
    ((timeout -= 2))
done

# Set display environment
export DISPLAY=:0
export XAUTHORITY="/home/pi/.Xauthority"

# Verify X11 is accessible
if ! xdpyinfo > /dev/null 2>&1; then
    log "❌ X11 display not accessible"
    # Try to fix X11 permissions
    if [[ -f /home/pi/.Xauthority ]]; then
        chown pi:pi /home/pi/.Xauthority
        chmod 600 /home/pi/.Xauthority
    fi
    
    # Wait a bit more
    sleep 5
    if ! xdpyinfo > /dev/null 2>&1; then
        log "❌ X11 still not accessible - exiting"
        exit 1
    fi
fi

log "✅ X11 display ready"

# Change to mesophy directory
cd "$MESOPHY_DIR" || {
    log "❌ Failed to change to $MESOPHY_DIR"
    exit 1
}

# Kill any existing processes first
pkill -f "node.*kiosk-server.js" || true
pkill -f "chromium.*localhost:3000" || true
sleep 2

# Start the Node.js server
log "🖥️ Starting kiosk server..."
node kiosk-server.js &
server_pid=$!
echo "$server_pid" > "$PID_FILE"

log "✅ Server started (PID: $server_pid)"

# Wait for server to be ready with better timeout handling
log "⏳ Waiting for server to be ready..."
timeout=30
server_ready=false

while [[ $timeout -gt 0 ]]; do
    if curl -s http://localhost:3000/api/status > /dev/null 2>&1; then
        server_ready=true
        break
    fi
    
    # Check if server process died
    if ! kill -0 "$server_pid" 2>/dev/null; then
        log "❌ Server process died during startup"
        exit 1
    fi
    
    sleep 1
    ((timeout--))
done

if [[ "$server_ready" != "true" ]]; then
    log "❌ Server failed to start within timeout"
    exit 1
fi

log "✅ Server is ready"

# Hide cursor
unclutter -idle 1 -root &

# Launch Chromium with simplified arguments
log "🌐 Launching Chromium kiosk..."

chromium_args=(
    --kiosk
    --no-sandbox
    --disable-infobars
    --disable-session-crashed-bubble
    --no-first-run
    --autoplay-policy=no-user-gesture-required
    --enable-features=VaapiVideoDecoder
    --window-position=0,0
    --start-fullscreen
    "http://localhost:3000"
)

# Launch Chromium
if command -v chromium-browser > /dev/null; then
    chromium-browser "${chromium_args[@]}" &
    chromium_pid=$!
elif command -v chromium > /dev/null; then
    chromium "${chromium_args[@]}" &
    chromium_pid=$!
else
    log "❌ Chromium not found!"
    exit 1
fi

log "✅ Chromium launched (PID: $chromium_pid)"
log "🎉 Kiosk system fully started - monitoring processes..."

# Simple monitoring loop
while true; do
    # Check server
    if ! kill -0 "$server_pid" 2>/dev/null; then
        log "❌ Server died - restarting..."
        node kiosk-server.js &
        server_pid=$!
        echo "$server_pid" > "$PID_FILE"
    fi
    
    # Check Chromium
    if ! kill -0 "$chromium_pid" 2>/dev/null; then
        log "❌ Chromium died - restarting..."
        if command -v chromium-browser > /dev/null; then
            chromium-browser "${chromium_args[@]}" &
            chromium_pid=$!
        else
            chromium "${chromium_args[@]}" &
            chromium_pid=$!
        fi
    fi
    
    sleep 10
done
EOF

chmod +x /opt/mesophy/start-kiosk.sh
chown pi:pi /opt/mesophy/start-kiosk.sh

log_info "✅ Start script updated"

# Fix 6: Install missing packages and configure screen sleep prevention
log_info "6. Installing missing packages and configuring display settings..."
if ! command -v unclutter > /dev/null; then
    apt-get update > /dev/null 2>&1
    apt-get install -y unclutter > /dev/null 2>&1
    log_info "✅ unclutter installed"
fi

# Configure X11 to disable screen blanking and power management
log_info "6a. Configuring screen sleep prevention..."
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

Section "ServerFlags"
    Option "NoTrapSignals" "true"
    Option "DontZap" "true"
EndSection
EOF

# Disable console blanking
if ! grep -q "consoleblank=0" /boot/cmdline.txt 2>/dev/null; then
    sed -i 's/$/ consoleblank=0/' /boot/cmdline.txt 2>/dev/null || true
fi

# Configure LXDE to disable screensaver
sudo -u pi mkdir -p /home/pi/.config/lxsession/LXDE-pi
sudo -u pi cat > /home/pi/.config/lxsession/LXDE-pi/autostart << 'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@point-rpi
@xset s off
@xset -dpms
@xset s noblank
EOF

log_info "✅ Screen sleep prevention configured"

# Fix 7: Reload systemd and services
log_info "7. Reloading services..."
systemctl daemon-reload
sudo -u pi systemctl --user daemon-reload

log_info "✅ Services reloaded"

echo
log_info "🎉 Auto-boot fixes applied successfully!"
echo
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║                      NEXT STEPS                         ║${NC}"
echo -e "${YELLOW}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}║${NC} 1. Reboot the Pi: ${GREEN}sudo reboot${NC}"
echo -e "${YELLOW}║${NC} 2. It should auto-login and launch kiosk automatically"
echo -e "${YELLOW}║${NC} 3. If issues persist, check logs:"
echo -e "${YELLOW}║${NC}    • ${GREEN}tail -f /opt/mesophy/logs/kiosk-launcher.log${NC}"
echo -e "${YELLOW}║${NC}    • ${GREEN}journalctl --user -u mesophy-kiosk-desktop -f${NC}"
echo -e "${YELLOW}║${NC}"
echo -e "${YELLOW}║${NC} ${GREEN}Manual test (if needed):${NC}"
echo -e "${YELLOW}║${NC} • ${GREEN}/opt/mesophy/start-kiosk.sh${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
echo

log_info "Configuration complete. Ready for reboot!"
EOF