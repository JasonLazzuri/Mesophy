# Mesophy Digital Signage Pi Client Installation

## 🚀 Quick Installation

### Step 1: Install as Systemd Service (Auto-Start)

```bash
# Navigate to the pi-client directory
cd /path/to/mesophy-pi-client

# Run the installation script
./install/install-service.sh
```

This will:
- ✅ Create systemd service for auto-start at boot
- ✅ Set proper permissions and directories
- ✅ Install Python dependencies
- ✅ Start the service automatically
- ✅ Configure auto-restart on crashes

### Step 2: Apply Database Schema Update

Run this SQL in your Supabase SQL editor to enable the new restart commands:

```sql
-- Add restart_content command type to device_commands table
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_command_type_check;

ALTER TABLE device_commands ADD CONSTRAINT device_commands_command_type_check 
CHECK (command_type IN (
    'restart',           -- Legacy restart command
    'restart_content',   -- NEW: Restart digital signage software only
    'reboot',           -- Restart entire Pi device
    'shutdown',         -- Shutdown the Pi device
    'update_playlist',  -- Deploy new playlist
    'sync_content',     -- Force content sync
    'update_config',    -- Update Pi client configuration
    'clear_cache',      -- Clear media cache
    'emergency_message', -- Display emergency message
    'test_display',     -- Test display functionality
    'get_logs',         -- Retrieve system logs
    'health_check'      -- Perform system health check
));
```

## 🔧 Manual Installation (Alternative)

If you prefer manual setup:

### 1. Create Directories
```bash
sudo mkdir -p /opt/mesophy/config
sudo mkdir -p /opt/mesophy/content
sudo mkdir -p /opt/mesophy/logs
sudo chown -R pi:pi /opt/mesophy
```

### 2. Install Dependencies
```bash
pip3 install --user requests psutil
```

### 3. Create Service File
```bash
sudo cp install/mesophy-signage.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mesophy-signage
sudo systemctl start mesophy-signage
```

## 📊 Service Management

### View Status
```bash
sudo systemctl status mesophy-signage
```

### View Live Logs
```bash
sudo journalctl -u mesophy-signage -f
```

### Control Service
```bash
# Stop service
sudo systemctl stop mesophy-signage

# Start service
sudo systemctl start mesophy-signage

# Restart service
sudo systemctl restart mesophy-signage

# Disable auto-start
sudo systemctl disable mesophy-signage
```

## 🎯 New Remote Control Features

After installation, you'll have **two restart buttons** in the portal:

### 🔄 Restart Content (Blue Button)
- **Purpose:** Restart digital signage software only
- **Speed:** 10-30 seconds recovery
- **Use for:** Content not updating, playlist stuck, display issues
- **What it does:**
  - Clears content cache
  - Downloads fresh content
  - Restarts software (systemd auto-restarts)
  - Maintains Pi system state

### 🔄 Restart Device (Orange Button)  
- **Purpose:** Restart entire Pi device
- **Speed:** 1-3 minutes recovery
- **Use for:** System issues, network problems, major glitches
- **What it does:**
  - Full Pi device reboot
  - All services restart
  - Network reconnection
  - Complete system refresh

## 🔍 Troubleshooting

### Service Won't Start
```bash
# Check service status
sudo systemctl status mesophy-signage

# Check logs for errors
sudo journalctl -u mesophy-signage -n 50

# Verify Python path and permissions
ls -la /home/pi/mesophy-pi-client/pi-client.py
```

### Remote Commands Not Working
1. **Check device is online** in portal
2. **Verify service is running:** `sudo systemctl status mesophy-signage`
3. **Check command logs:** `sudo journalctl -u mesophy-signage -f`
4. **Test manual restart:** `sudo systemctl restart mesophy-signage`

### Auto-Start Not Working
```bash
# Check if service is enabled
sudo systemctl is-enabled mesophy-signage

# Re-enable if needed
sudo systemctl enable mesophy-signage
```

## ✅ Verification

After installation, verify everything works:

1. **Service Auto-Starts:** Reboot Pi and check service status
2. **Device Shows Online:** Check portal devices page
3. **Remote Commands Work:** Test both restart buttons
4. **Logs Are Clean:** No errors in service logs

The Pi client will now automatically start at boot and restart if it crashes, providing reliable remote management capabilities.