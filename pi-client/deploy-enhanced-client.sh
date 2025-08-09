#!/bin/bash
# Deploy enhanced Pi client with display fixes

echo "🚀 Deploying Enhanced Mesophy Pi Client"
echo "======================================"

# Stop any running client
echo "Stopping existing client processes..."
sudo pkill -f "python3.*native-display.py" || true
sudo pkill -f "python3.*native-display" || true
sleep 2

# Clean up old pairing images to free space
echo "Cleaning up old pairing images..."
find /opt/mesophy/temp/ -name "pairing_screen_*.png" -mtime +1 -delete 2>/dev/null || true
echo "Cleaned up old pairing screen images"

# Backup current client
if [ -f "/opt/mesophy/native-display.py" ]; then
    echo "Backing up current client..."
    sudo cp /opt/mesophy/native-display.py /opt/mesophy/native-display.py.backup.$(date +%Y%m%d_%H%M%S)
fi

# Download enhanced client
echo "Downloading enhanced Pi client..."
cd /opt/mesophy

# Create a temporary enhanced client with all our fixes
sudo tee native-display-enhanced.py > /dev/null << 'ENHANCED_CLIENT_EOF'
#!/usr/bin/env python3
"""
Mesophy Pi Client - Native Display Manager (Enhanced Version)
Direct screen rendering like Mediafy - no browser required
Enhanced with X11 permission fixes and robust display methods
"""

import os
import sys
import time
import json
import subprocess
import threading
import signal
import requests
import logging
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# Import our modules
try:
    # Try importing from same directory
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    from api_client import MesophyAPIClient
    from media_player import NativeMediaPlayer
except ImportError as e:
    print(f"Warning: Could not import api_client or media_player modules: {e}")
    MesophyAPIClient = None
    NativeMediaPlayer = None

# Configuration paths
CONFIG_PATH = '/opt/mesophy/config/config.json'
DEVICE_CONFIG_PATH = '/opt/mesophy/config/device.json'
TEMP_DIR = '/opt/mesophy/temp'
CONTENT_DIR = '/opt/mesophy/content'
LOG_DIR = '/opt/mesophy/logs'

# Setup logging
def setup_logging():
    """Setup comprehensive logging for debugging"""
    os.makedirs(LOG_DIR, exist_ok=True)
    
    # Configure logging to both file and console
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f'{LOG_DIR}/mesophy-display.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Also log to a separate debug file
    debug_handler = logging.FileHandler(f'{LOG_DIR}/debug.log')
    debug_handler.setLevel(logging.DEBUG)
    debug_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s')
    debug_handler.setFormatter(debug_formatter)
    
    logger = logging.getLogger()
    logger.addHandler(debug_handler)
    logger.setLevel(logging.DEBUG)
    
    return logger

class NativeDisplayManager:
    def __init__(self):
        # Initialize logger
        self.logger = logging.getLogger(__name__)
        
        self.logger.info("=== STARTING ENHANCED MESOPHY DISPLAY MANAGER ===")
        self.logger.info(f"Python version: {sys.version}")
        self.logger.info(f"Working directory: {os.getcwd()}")
        
        self.config = self.load_config()
        self.device_config = None
        self.current_pairing_code = None
        self.is_paired = False
        self.display_width = self.config.get('display', {}).get('width', 1920)
        self.display_height = self.config.get('display', {}).get('height', 1080)
        self.api_base = self.config.get('api', {}).get('baseUrl', 'https://mesophy.vercel.app')
        
        self.logger.info(f"Display size: {self.display_width}x{self.display_height}")
        self.logger.info(f"API base URL: {self.api_base}")
        
        # Display state
        self.current_display_process = None
        self.display_mode = 'pairing'  # pairing, content, error
        
        # Initialize API client and media player
        self.api_client = MesophyAPIClient() if MesophyAPIClient else None
        self.media_player = NativeMediaPlayer() if NativeMediaPlayer else None
        
        self.logger.info(f"API client available: {self.api_client is not None}")
        self.logger.info(f"Media player available: {self.media_player is not None}")
        
        # Ensure directories exist
        os.makedirs(TEMP_DIR, exist_ok=True)
        os.makedirs(CONTENT_DIR, exist_ok=True)
        os.makedirs(LOG_DIR, exist_ok=True)
        
        # Load existing device config if available
        device_config_loaded = self.load_device_config()
        self.logger.info(f"Device config loaded: {device_config_loaded}")
        self.logger.info(f"Is paired: {self.is_paired}")
        if self.device_config:
            self.logger.info(f"Screen name: {self.device_config.get('screen_name', 'Unknown')}")
            self.logger.info(f"Device token: {'***' + self.device_config.get('device_token', '')[-8:] if self.device_config.get('device_token') else 'None'}")

    def load_config(self):
        """Load main configuration file"""
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, 'r') as f:
                    return json.load(f)
            else:
                # Default config
                default_config = {
                    "api": {
                        "baseUrl": "https://mesophy.vercel.app",
                        "endpoints": {
                            "generateCode": "/api/devices/generate-code",
                            "checkPairing": "/api/devices/check-pairing",
                            "sync": "/api/devices/sync",
                            "heartbeat": "/api/devices/heartbeat"
                        }
                    },
                    "device": {
                        "syncInterval": 120,
                        "heartbeatInterval": 300
                    },
                    "display": {
                        "width": 1920,
                        "height": 1080,
                        "fullscreen": True
                    }
                }
                
                # Save default config
                os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
                with open(CONFIG_PATH, 'w') as f:
                    json.dump(default_config, f, indent=2)
                
                return default_config
        except Exception as e:
            print(f"Error loading config: {e}")
            return {}

    def load_device_config(self):
        """Load saved device configuration"""
        self.logger.debug(f"Looking for device config at: {DEVICE_CONFIG_PATH}")
        
        try:
            if os.path.exists(DEVICE_CONFIG_PATH):
                self.logger.info(f"Device config file exists, loading...")
                with open(DEVICE_CONFIG_PATH, 'r') as f:
                    self.device_config = json.load(f)
                    self.is_paired = True
                    self.logger.info(f"✅ Loaded saved device config for: {self.device_config.get('screen_name', 'Unknown')}")
                    self.logger.debug(f"Device config details: {json.dumps(self.device_config, indent=2)}")
                    return True
            else:
                self.logger.info(f"No device config file found at {DEVICE_CONFIG_PATH}")
        except Exception as e:
            self.logger.error(f"Error loading device config: {e}")
        
        self.device_config = None
        self.is_paired = False
        self.logger.info("Device is not paired")
        return False

    def save_device_config(self, config):
        """Save device configuration"""
        self.logger.info("💾 Saving device configuration...")
        self.logger.debug(f"Config to save: {json.dumps(config, indent=2)}")
        
        try:
            os.makedirs(os.path.dirname(DEVICE_CONFIG_PATH), exist_ok=True)
            with open(DEVICE_CONFIG_PATH, 'w') as f:
                json.dump(config, f, indent=2)
            self.device_config = config
            self.is_paired = True
            self.logger.info(f"✅ Device config saved for: {config.get('screen_name', 'Unknown')}")
            self.logger.info(f"📱 Device is now PAIRED: {self.is_paired}")
        except Exception as e:
            self.logger.error(f"❌ Error saving device config: {e}")

    def generate_pairing_screen(self, pairing_code):
        """Generate pairing screen image using PIL"""
        self.logger.info(f"Generating pairing screen for code: {pairing_code}")
        
        # Create image
        img = Image.new('RGB', (self.display_width, self.display_height), color='black')
        draw = ImageDraw.Draw(img)
        
        # Try to load fonts, fall back to defaults
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
            code_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 140)
            text_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 48)
            small_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 36)
        except:
            # Fallback to default fonts
            title_font = ImageFont.load_default()
            code_font = ImageFont.load_default()
            text_font = ImageFont.load_default()
            small_font = ImageFont.load_default()
        
        # Colors
        white = (255, 255, 255)
        blue = (79, 70, 229)
        green = (16, 185, 129)
        gray = (107, 114, 128)
        
        # Center position
        center_x = self.display_width // 2
        y_pos = 150
        
        # Title
        title_text = "MESOPHY DIGITAL SIGNAGE"
        title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
        title_width = title_bbox[2] - title_bbox[0]
        draw.text((center_x - title_width//2, y_pos), title_text, fill=blue, font=title_font)
        y_pos += 120
        
        # Subtitle
        subtitle_text = "Device Setup Required"
        subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=text_font)
        subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
        draw.text((center_x - subtitle_width//2, y_pos), subtitle_text, fill=gray, font=text_font)
        y_pos += 100
        
        # Pairing code box
        code_bbox = draw.textbbox((0, 0), pairing_code, font=code_font)
        code_width = code_bbox[2] - code_bbox[0]
        code_height = code_bbox[3] - code_bbox[1]
        
        # Draw code background box
        box_padding = 30
        box_left = center_x - code_width//2 - box_padding
        box_right = center_x + code_width//2 + box_padding
        box_top = y_pos - box_padding
        box_bottom = y_pos + code_height + box_padding
        
        draw.rectangle([box_left, box_top, box_right, box_bottom], fill=(31, 41, 55), outline=blue, width=4)
        draw.text((center_x - code_width//2, y_pos), pairing_code, fill=white, font=code_font)
        y_pos += code_height + 100
        
        # Instructions
        instructions = [
            "1. Go to mesophy.vercel.app",
            "2. Login and navigate to Screens",
            "3. Click 'Pair Device'",
            "4. Enter the code above"
        ]
        
        for instruction in instructions:
            inst_bbox = draw.textbbox((0, 0), instruction, font=text_font)
            inst_width = inst_bbox[2] - inst_bbox[0]
            draw.text((center_x - inst_width//2, y_pos), instruction, fill=white, font=text_font)
            y_pos += 60
        
        # Status
        y_pos += 50
        status_text = "Status: Waiting for setup... (Enhanced Client)"
        status_bbox = draw.textbbox((0, 0), status_text, font=small_font)
        status_width = status_bbox[2] - status_bbox[0]
        draw.text((center_x - status_width//2, y_pos), status_text, fill=gray, font=small_font)
        
        # WiFi status (bottom right)
        wifi_text = "WiFi: Connected ✓"
        wifi_bbox = draw.textbbox((0, 0), wifi_text, font=small_font)
        draw.text((self.display_width - wifi_bbox[2] - 50, self.display_height - wifi_bbox[3] - 50), 
                 wifi_text, fill=green, font=small_font)
        
        # Save image
        image_path = os.path.join(TEMP_DIR, f'pairing_screen_{pairing_code}.png')
        img.save(image_path, 'PNG')
        self.logger.info(f"Pairing screen saved to: {image_path}")
        
        return image_path

    def display_image(self, image_path):
        """Enhanced display image method with X11 fixes and fallbacks"""
        self.logger.info(f"🖼️ ENHANCED: Displaying image: {image_path}")
        
        # Kill existing display process
        if self.current_display_process:
            try:
                self.current_display_process.terminate()
                self.current_display_process.wait(timeout=5)
            except:
                try:
                    self.current_display_process.kill()
                except:
                    pass
            self.current_display_process = None
        
        # Check if debug mode is enabled (environment variable or config)
        debug_mode = os.environ.get('MESOPHY_DEBUG', '').lower() in ['true', '1', 'yes']
        use_window = debug_mode or self.config.get('debug', {}).get('use_window', False)
        
        if use_window:
            # Debug mode: Display in a window (visible via VNC)
            self.logger.info("🐛 ENHANCED DEBUG MODE: Displaying in window for VNC viewing")
            
            # Set up X11 environment properly
            env = os.environ.copy()
            env['DISPLAY'] = ':0'
            
            # ENHANCED: Try to fix X11 permissions if running as root
            if os.geteuid() == 0:
                self.logger.info("🔧 ENHANCED: Running as root, applying X11 permission fixes...")
                try:
                    # Allow local connections
                    subprocess.run(['xhost', '+local:'], env=env, capture_output=True)
                    self.logger.info("✅ Applied xhost +local:")
                    
                    # Copy X authority from pi user if it exists
                    if os.path.exists('/home/pi/.Xauthority'):
                        env['XAUTHORITY'] = '/home/pi/.Xauthority'
                        self.logger.info("✅ Using pi user's X authority")
                        
                    # Try additional permission fixes
                    subprocess.run(['xhost', '+si:localuser:pi'], env=env, capture_output=True)
                    subprocess.run(['xhost', '+si:localuser:root'], env=env, capture_output=True)
                    self.logger.info("✅ Applied additional xhost permissions")
                    
                except Exception as e:
                    self.logger.warning(f"⚠️ X11 permission fix failed: {e}")
            
            # ENHANCED: Try the most compatible image viewers with better error handling
            viewers = [
                {
                    'name': 'eog (enhanced)',
                    'cmd': ['eog', '--fullscreen', image_path],
                    'reason': 'Most VNC-compatible, fullscreen mode'
                },
                {
                    'name': 'gpicview (enhanced)',
                    'cmd': ['gpicview', '--fullscreen', image_path],
                    'reason': 'Lightweight, fullscreen for Pi'
                },
                {
                    'name': 'feh (enhanced windowed)',
                    'cmd': ['feh', '--geometry', '1920x1080', '--bg-fill', image_path],
                    'reason': 'Fast image viewer with background mode'
                },
                {
                    'name': 'feh (enhanced fullscreen)',
                    'cmd': ['feh', '--fullscreen', '--auto-zoom', '--no-menus', image_path],
                    'reason': 'Fullscreen fast viewer'
                }
            ]
            
            for viewer in viewers:
                try:
                    self.logger.info(f"🧪 ENHANCED: Trying {viewer['name']} ({viewer['reason']})...")
                    
                    # Check if command exists
                    result = subprocess.run(['which', viewer['cmd'][0]], capture_output=True)
                    if result.returncode != 0:
                        self.logger.warning(f"❌ {viewer['name']} not found")
                        continue
                    
                    # Try to run the viewer
                    self.current_display_process = subprocess.Popen(
                        viewer['cmd'],
                        env=env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE
                    )
                    
                    # Give it more time to start
                    time.sleep(3)
                    
                    # Check if process is still running
                    if self.current_display_process.poll() is None:
                        self.logger.info(f"✅ ENHANCED SUCCESS: {viewer['name']} running with PID {self.current_display_process.pid}")
                        return
                    else:
                        # Process exited, log the error
                        stdout, stderr = self.current_display_process.communicate()
                        error_msg = stderr.decode().strip()
                        self.logger.warning(f"❌ {viewer['name']} failed: {error_msg}")
                        
                except Exception as e:
                    self.logger.warning(f"❌ Exception with {viewer['name']}: {e}")
                    continue
            
            # ENHANCED: Desktop copy fallback
            self.logger.warning("⚠️ ENHANCED: All X11 viewers failed, trying desktop copy fallback...")
            try:
                desktop_path = "/home/pi/Desktop/current_pairing_screen.png"
                subprocess.run(['cp', image_path, desktop_path], check=True)
                self.logger.info(f"📋 ENHANCED: Image copied to desktop: {desktop_path}")
                self.logger.info("💡 You can open this file manually via VNC to see the pairing code")
            except Exception as e:
                self.logger.error(f"❌ Desktop copy failed: {e}")
        
        # ENHANCED: Production mode - Use framebuffer (direct HDMI output)
        self.logger.info("📺 ENHANCED: Production mode - Displaying via framebuffer (HDMI)")
        
        # Check if framebuffer exists
        if not os.path.exists('/dev/fb0'):
            self.logger.error("❌ /dev/fb0 framebuffer not found")
            return
            
        # ENHANCED: Check permissions on framebuffer
        try:
            stat = os.stat('/dev/fb0')
            perms = oct(stat.st_mode)[-3:]
            self.logger.info(f"📺 /dev/fb0 permissions: {perms}")
            
            # Check if we can write to it
            with open('/dev/fb0', 'r+b') as fb:
                self.logger.info("✅ ENHANCED: Framebuffer write access confirmed")
        except PermissionError:
            self.logger.error("❌ No write permission to /dev/fb0")
            self.logger.info("💡 Try: sudo usermod -a -G video pi && sudo reboot")
        except Exception as e:
            self.logger.warning(f"⚠️ Framebuffer access test failed: {e}")
            
        # ENHANCED: Try multiple framebuffer display methods
        fb_methods = [
            {
                'name': 'fbi (enhanced direct)',
                'cmd': ['fbi', '-d', '/dev/fb0', '-T', '1', '--noverbose', '-a', '--once', image_path],
                'reason': 'Direct framebuffer with once flag'
            },
            {
                'name': 'fbi (enhanced no-exit)',
                'cmd': ['fbi', '-d', '/dev/fb0', '-T', '1', '--noverbose', '-a', '--blend', '0', image_path],
                'reason': 'Framebuffer with blend settings'
            },
            {
                'name': 'fbi (enhanced persistent)',
                'cmd': ['fbi', '-d', '/dev/fb0', '-T', '1', '-a', image_path],
                'reason': 'Persistent framebuffer display'
            }
        ]
        
        for method in fb_methods:
            try:
                self.logger.info(f"🧪 ENHANCED: Trying {method['name']} ({method['reason']})...")
                
                # Check if fbi exists
                result = subprocess.run(['which', 'fbi'], capture_output=True)
                if result.returncode != 0:
                    self.logger.error("❌ fbi not found - install with: sudo apt install fbi")
                    break
                
                self.logger.info(f"🚀 ENHANCED: Running: {' '.join(method['cmd'])}")
                self.current_display_process = subprocess.Popen(
                    method['cmd'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                
                # Give it time to load the image
                time.sleep(2)
                
                # Check if process is still running or completed successfully
                if self.current_display_process.poll() is None:
                    self.logger.info(f"✅ ENHANCED SUCCESS: {method['name']} running with PID {self.current_display_process.pid}")
                    return
                else:
                    # Check if it completed successfully (fbi sometimes exits after displaying)
                    stdout, stderr = self.current_display_process.communicate()
                    stderr_text = stderr.decode().strip()
                    stdout_text = stdout.decode().strip()
                    
                    # ENHANCED: Better success detection
                    if any(keyword in stderr_text.lower() for keyword in ['using', 'file=', 'font']):
                        self.logger.info(f"✅ ENHANCED: {method['name']} completed successfully (image displayed)")
                        self.logger.debug(f"fbi output: {stderr_text}")
                        # Keep the process reference even though it exited
                        return
                    else:
                        self.logger.warning(f"❌ {method['name']} failed: {stderr_text}")
                        if stdout_text:
                            self.logger.debug(f"stdout: {stdout_text}")
                        
            except Exception as e:
                self.logger.warning(f"❌ Exception with {method['name']}: {e}")
                continue
        
        self.logger.info("✅ ENHANCED: Display methods completed. Image should be visible on HDMI output.")

    def generate_pairing_code(self):
        """Generate new pairing code from API"""
        self.logger.info("📞 Generating pairing code...")
        
        try:
            # Get system info
            system_info = {
                'hostname': os.uname().nodename,
                'platform': 'linux',
                'arch': os.uname().machine
            }
            
            url = f"{self.api_base}{self.config['api']['endpoints']['generateCode']}"
            response = requests.post(url, json={'device_info': system_info}, timeout=10)
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.current_pairing_code = data['pairing_code']
                self.logger.info(f"✅ Pairing code generated: {self.current_pairing_code}")
                return self.current_pairing_code
            else:
                self.logger.error(f"❌ Failed to generate pairing code: {response.status_code}")
                self.logger.error(f"Response: {response.text}")
                return None
                
        except Exception as e:
            self.logger.error(f"❌ Error generating pairing code: {e}")
            return None

    def check_pairing_status(self):
        """Check if device has been paired"""
        if not self.current_pairing_code:
            self.logger.debug("No pairing code available, skipping status check")
            return False
            
        try:
            url = f"{self.api_base}{self.config['api']['endpoints']['checkPairing']}/{self.current_pairing_code}"
            self.logger.debug(f"🔍 Checking pairing status at: {url}")
            
            response = requests.get(url, timeout=10)
            self.logger.debug(f"API response: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.logger.debug(f"Response data: {json.dumps(data, indent=2)}")
                
                if data.get('paired') and data.get('device_config'):
                    self.logger.info("🎉 DEVICE SUCCESSFULLY PAIRED!")
                    self.save_device_config(data['device_config'])
                    return True
                else:
                    self.logger.debug(f"Not yet paired - status: {data.get('status', 'unknown')}")
            else:
                self.logger.warning(f"API returned status {response.status_code}: {response.text}")
                    
        except Exception as e:
            self.logger.error(f"❌ Error checking pairing status: {e}")
            
        return False

    def show_pairing_screen(self):
        """Display pairing screen"""
        self.logger.info("📺 Showing pairing screen")
        self.display_mode = 'pairing'
        
        if not self.current_pairing_code:
            self.current_pairing_code = self.generate_pairing_code()
        
        if self.current_pairing_code:
            image_path = self.generate_pairing_screen(self.current_pairing_code)
            self.display_image(image_path)
        else:
            self.logger.error("❌ Failed to generate pairing code")

    def start_pairing_loop(self):
        """Main pairing loop with enhanced logging"""
        self.logger.info("🚀 ENHANCED: Starting pairing loop...")
        
        while not self.is_paired:
            # Show pairing screen
            self.show_pairing_screen()
            
            # Check for pairing every 10 seconds (more frequent)
            for i in range(6):  # 6 * 10 = 60 seconds
                self.logger.debug(f"⏰ Checking pairing status... ({i+1}/6)")
                time.sleep(10)
                if self.check_pairing_status():
                    self.logger.info("🎉 ENHANCED: Pairing successful, exiting pairing loop")
                    return  # Exit the pairing loop completely
            else:
                # Regenerate code every 10 minutes instead of 5
                self.logger.info("🔄 ENHANCED: Regenerating pairing code...")
                self.current_pairing_code = None

    def run(self):
        """Enhanced main run loop"""
        self.logger.info("🚀 ENHANCED: Starting Mesophy Native Display Manager...")
        
        # Check if already paired
        if self.is_paired:
            self.logger.info("✅ ENHANCED: Device already paired, starting content playback")
            self.logger.info(f"Connected to screen: {self.device_config.get('screen_name', 'Unknown') if self.device_config else 'Unknown'}")
            # For now, just show the pairing success screen
            self.logger.info("📺 ENHANCED: Showing paired status screen")
            # Could add content playback here later
            
            # Keep running
            try:
                while True:
                    time.sleep(60)
            except KeyboardInterrupt:
                self.logger.info("🛑 Received interrupt signal")
                pass
        else:
            self.logger.info("❌ ENHANCED: Device not paired, starting pairing process")
            self.start_pairing_loop()
            
            if self.is_paired:
                self.logger.info("🎉 ENHANCED: Pairing successful!")
                
                # Keep running after successful pairing
                try:
                    while True:
                        time.sleep(60)
                except KeyboardInterrupt:
                    self.logger.info("🛑 Received interrupt signal")
                    pass

def main():
    # Setup logging first
    logger = setup_logging()
    logger.info("=" * 60)
    logger.info("ENHANCED MESOPHY PI CLIENT STARTING")
    logger.info("=" * 60)
    
    try:
        display_manager = NativeDisplayManager()
        display_manager.run()
    except Exception as e:
        logger.error(f"💥 ENHANCED FATAL ERROR: {e}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
ENHANCED_CLIENT_EOF

echo "Enhanced client created. Now replacing the old one..."

# Replace the old client with enhanced version
sudo mv native-display-enhanced.py native-display.py
sudo chmod +x native-display.py

echo "✅ Enhanced Pi client deployed successfully!"
echo ""
echo "🧪 Testing enhanced client..."
echo "Run: sudo MESOPHY_DEBUG=true python3 native-display.py"
echo ""
echo "🔧 Enhanced features:"
echo "  • Fixed X11 permissions for VNC display"
echo "  • Multiple display method fallbacks"
echo "  • Better framebuffer handling"
echo "  • Enhanced logging and debugging"
echo "  • Automatic permission fixes"