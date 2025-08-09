#!/usr/bin/env python3
"""
Mesophy Pi Client - Native Display Manager
Direct screen rendering like Mediafy - no browser required
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
        
        self.logger.info("=== STARTING MESOPHY DISPLAY MANAGER ===")
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
        print(f"Generating pairing screen for code: {pairing_code}")
        
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
        status_text = "Status: Waiting for setup..."
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
        print(f"Pairing screen saved to: {image_path}")
        
        return image_path

    def generate_content_screen(self):
        """Generate content display screen"""
        print("Generating content display screen")
        
        # Create image
        img = Image.new('RGB', (self.display_width, self.display_height), color='black')
        draw = ImageDraw.Draw(img)
        
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 60)
            text_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 40)
        except:
            title_font = ImageFont.load_default()
            text_font = ImageFont.load_default()
        
        # Colors
        white = (255, 255, 255)
        green = (16, 185, 129)
        gray = (107, 114, 128)
        
        center_x = self.display_width // 2
        center_y = self.display_height // 2
        
        if self.device_config:
            # Screen name
            screen_name = self.device_config.get('screen_name', 'Digital Display')
            name_bbox = draw.textbbox((0, 0), screen_name, font=title_font)
            name_width = name_bbox[2] - name_bbox[0]
            draw.text((center_x - name_width//2, center_y - 100), screen_name, fill=white, font=title_font)
            
            # Status
            status_text = "✓ Device Paired Successfully"
            status_bbox = draw.textbbox((0, 0), status_text, font=text_font)
            status_width = status_bbox[2] - status_bbox[0]
            draw.text((center_x - status_width//2, center_y - 20), status_text, fill=green, font=text_font)
            
            # Content info
            content_text = "Content playback will begin shortly..."
            content_bbox = draw.textbbox((0, 0), content_text, font=text_font)
            content_width = content_bbox[2] - content_bbox[0]
            draw.text((center_x - content_width//2, center_y + 40), content_text, fill=gray, font=text_font)
            
            # Screen details
            details = [
                f"Screen Type: {self.device_config.get('screen_type', 'Unknown')}",
                f"Location: {self.device_config.get('location', {}).get('name', 'Unknown')}"
            ]
            
            y_pos = center_y + 120
            for detail in details:
                detail_bbox = draw.textbbox((0, 0), detail, font=text_font)
                detail_width = detail_bbox[2] - detail_bbox[0]
                draw.text((center_x - detail_width//2, y_pos), detail, fill=gray, font=text_font)
                y_pos += 50
        
        # Save image
        image_path = os.path.join(TEMP_DIR, 'content_screen.png')
        img.save(image_path, 'PNG')
        
        return image_path

    def display_image(self, image_path):
        """Display image using fbi (framebuffer) or window (debug mode)"""
        self.logger.info(f"🖼️ Displaying image: {image_path}")
        
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
            self.logger.info("🐛 Debug mode: Displaying in window for VNC viewing")
            
            # Set DISPLAY environment variable for X11
            env = os.environ.copy()
            if 'DISPLAY' not in env:
                env['DISPLAY'] = ':0'
                self.logger.info("Setting DISPLAY=:0 for X11")
            
            # Try multiple image viewers
            viewers = [
                {
                    'name': 'feh',
                    'cmd': ['feh', '--fullscreen', '--auto-zoom', '--no-menus', '--quiet', image_path]
                },
                {
                    'name': 'eog',
                    'cmd': ['eog', '--fullscreen', image_path]
                },
                {
                    'name': 'gpicview',
                    'cmd': ['gpicview', '--fullscreen', image_path]
                },
                {
                    'name': 'xdg-open',
                    'cmd': ['xdg-open', image_path]
                }
            ]
            
            for viewer in viewers:
                try:
                    self.logger.info(f"Trying {viewer['name']} for display...")
                    # First check if the command exists
                    result = subprocess.run(['which', viewer['cmd'][0]], capture_output=True)
                    if result.returncode != 0:
                        self.logger.warning(f"{viewer['name']} not found, skipping")
                        continue
                    
                    # Try to run the viewer
                    self.current_display_process = subprocess.Popen(
                        viewer['cmd'],
                        env=env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE
                    )
                    
                    # Give it a moment to start
                    time.sleep(1)
                    
                    # Check if process is still running
                    if self.current_display_process.poll() is None:
                        self.logger.info(f"✅ Image displayed using {viewer['name']} with PID: {self.current_display_process.pid}")
                        return
                    else:
                        # Process exited, get the error
                        stdout, stderr = self.current_display_process.communicate()
                        self.logger.warning(f"{viewer['name']} exited: {stderr.decode()}")
                        
                except Exception as e:
                    self.logger.warning(f"Failed to use {viewer['name']}: {e}")
                    continue
            
            # If all viewers failed, fall back to framebuffer
            self.logger.warning("All window viewers failed, falling back to framebuffer display")
        
        # Production mode: Use framebuffer (direct HDMI output)
        self.logger.info("📺 Production mode: Displaying via framebuffer (HDMI)")
        
        # Check if framebuffer exists
        if not os.path.exists('/dev/fb0'):
            self.logger.error("❌ /dev/fb0 framebuffer not found")
            return
            
        try:
            # First check if fbi is available
            result = subprocess.run(['which', 'fbi'], capture_output=True)
            if result.returncode != 0:
                self.logger.error("❌ fbi not found - install with: sudo apt install fbi")
                return
                
            # Use fbi to display image directly to framebuffer
            cmd = [
                'fbi',
                '-d', '/dev/fb0',
                '-T', '1',
                '-noverbose',
                '-a',  # autozoom
                image_path
            ]
            
            self.logger.info(f"Running: {' '.join(cmd)}")
            self.current_display_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Give it a moment to start
            time.sleep(0.5)
            
            # Check if process is still running
            if self.current_display_process.poll() is None:
                self.logger.info(f"✅ Image displayed via framebuffer with PID: {self.current_display_process.pid}")
            else:
                # Process exited, get the error
                stdout, stderr = self.current_display_process.communicate()
                self.logger.error(f"❌ fbi exited with error: {stderr.decode()}")
            
        except Exception as e:
            self.logger.error(f"❌ Error displaying image with fbi: {e}")
            
            # Fallback: try using convert to write directly to framebuffer
            self.logger.info("Trying convert fallback...")
            try:
                # Check if ImageMagick is available
                result = subprocess.run(['which', 'convert'], capture_output=True)
                if result.returncode != 0:
                    self.logger.error("❌ convert not found - install with: sudo apt install imagemagick")
                    return
                    
                cmd = f"convert '{image_path}' -resize {self.display_width}x{self.display_height}! RGB:- | dd of=/dev/fb0 2>/dev/null"
                self.logger.info(f"Running convert: {cmd}")
                result = subprocess.run(cmd, shell=True, capture_output=True)
                if result.returncode == 0:
                    self.logger.info("✅ Image displayed using convert fallback")
                else:
                    self.logger.error(f"❌ Convert failed: {result.stderr.decode()}")
                    
            except Exception as e2:
                self.logger.error(f"❌ Error with convert fallback: {e2}")

    def generate_pairing_code(self):
        """Generate new pairing code from API"""
        print("Generating pairing code...")
        
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
            print(f"Error generating pairing code: {e}")
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
                    # Show pairing success screen and hold for a few seconds
                    self.show_pairing_success()
                    # Wait a bit to let user see the success message
                    time.sleep(3)
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
        print("Showing pairing screen")
        self.display_mode = 'pairing'
        
        if not self.current_pairing_code:
            self.current_pairing_code = self.generate_pairing_code()
        
        if self.current_pairing_code:
            image_path = self.generate_pairing_screen(self.current_pairing_code)
            self.display_image(image_path)
        else:
            print("Failed to generate pairing code")

    def show_pairing_success(self):
        """Show pairing success message"""
        print("Showing pairing success screen")
        
        # Generate success screen
        img = Image.new('RGB', (self.display_width, self.display_height), color='black')
        draw = ImageDraw.Draw(img)
        
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
            text_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 48)
        except:
            title_font = ImageFont.load_default()
            text_font = ImageFont.load_default()
        
        # Colors
        white = (255, 255, 255)
        green = (16, 185, 129)
        gray = (107, 114, 128)
        
        center_x = self.display_width // 2
        center_y = self.display_height // 2
        
        # Success icon (checkmark)
        success_text = "✓"
        success_bbox = draw.textbbox((0, 0), success_text, font=title_font)
        success_width = success_bbox[2] - success_bbox[0]
        draw.text((center_x - success_width//2, center_y - 150), success_text, fill=green, font=title_font)
        
        # Success message
        success_msg = "PAIRING SUCCESSFUL!"
        success_bbox = draw.textbbox((0, 0), success_msg, font=title_font)
        success_width = success_bbox[2] - success_bbox[0]
        draw.text((center_x - success_width//2, center_y - 50), success_msg, fill=green, font=title_font)
        
        # Waiting message
        waiting_msg = "Waiting for media content..."
        waiting_bbox = draw.textbbox((0, 0), waiting_msg, font=text_font)
        waiting_width = waiting_bbox[2] - waiting_bbox[0]
        draw.text((center_x - waiting_width//2, center_y + 50), waiting_msg, fill=gray, font=text_font)
        
        # Device info if available
        if self.device_config:
            info_msg = f"Connected to: {self.device_config.get('screen_name', 'Unknown Screen')}"
            info_bbox = draw.textbbox((0, 0), info_msg, font=text_font)
            info_width = info_bbox[2] - info_bbox[0]
            draw.text((center_x - info_width//2, center_y + 120), info_msg, fill=white, font=text_font)
        
        # Save and display
        image_path = os.path.join(TEMP_DIR, 'pairing_success.png')
        img.save(image_path, 'PNG')
        self.display_image(image_path)

    def show_content_screen(self):
        """Display content screen after pairing"""
        print("Showing content screen")
        self.display_mode = 'content'
        
        image_path = self.generate_content_screen()
        self.display_image(image_path)

    def start_pairing_loop(self):
        """Main pairing loop"""
        print("Starting pairing loop...")
        
        while not self.is_paired:
            # Show pairing screen
            self.show_pairing_screen()
            
            # Check for pairing every 30 seconds
            for _ in range(6):  # 6 * 5 = 30 seconds
                time.sleep(5)
                if self.check_pairing_status():
                    print("Pairing successful, exiting pairing loop")
                    return  # Exit the pairing loop completely
            else:
                # Regenerate code every 5 minutes
                print("Regenerating pairing code...")
                self.current_pairing_code = None

    def start_content_playback(self):
        """Start content sync and playback after pairing"""
        print("Starting content playback services...")
        
        if not self.is_paired or not self.device_config:
            print("Device not paired, cannot start content playback")
            return
        
        # Start API services for sync and heartbeat
        if self.api_client:
            self.api_client.start_sync_service()
            self.api_client.start_heartbeat_service()
            
            # Initial content sync
            threading.Thread(target=self.sync_and_play_content, daemon=True).start()
        
        # Show brief content screen then start playback
        self.show_content_screen()
        time.sleep(5)  # Show for 5 seconds
        
        # Start media playback
        if self.media_player:
            # Check if we have content to play
            if self.has_content():
                print("Starting media playback...")
                self.media_player.start_playlist_playback()
            else:
                print("No content available, showing test pattern...")
                self.media_player.show_test_pattern()

    def sync_and_play_content(self):
        """Sync content from server and update playlist"""
        if not self.api_client or not self.media_player:
            return
            
        try:
            print("Syncing content from server...")
            sync_data = self.api_client.sync_content()
            
            if sync_data and sync_data.get('current_schedule'):
                schedule = sync_data['current_schedule']
                if schedule.get('playlist') and schedule['playlist'].get('items'):
                    print(f"Loading playlist: {schedule['playlist']['name']}")
                    self.media_player.stop_playlist_playback()
                    self.media_player.load_playlist(schedule['playlist'])
                    self.media_player.start_playlist_playback()
                else:
                    print("No playlist items found in current schedule")
            else:
                print("No current schedule found")
                
        except Exception as e:
            print(f"Error syncing content: {e}")

    def has_content(self):
        """Check if we have any content to play"""
        content_path = Path(CONTENT_DIR)
        if not content_path.exists():
            return False
            
        # Check for media files
        for ext in ['.mp4', '.mov', '.avi', '.jpg', '.jpeg', '.png', '.gif']:
            if list(content_path.glob(f'*{ext}')):
                return True
        return False

    def run(self):
        """Main run loop"""
        self.logger.info("🚀 Starting Mesophy Native Display Manager...")
        
        # Check if already paired
        if self.is_paired:
            self.logger.info("✅ Device already paired, starting content playback")
            self.logger.info(f"Connected to screen: {self.device_config.get('screen_name', 'Unknown') if self.device_config else 'Unknown'}")
            self.start_content_playback()
            
            # Keep running
            try:
                self.logger.info("📺 Entering main content loop")
                while True:
                    time.sleep(60)
                    # Periodic content sync (every hour)
                    if int(time.time()) % 3600 == 0:
                        self.logger.info("🔄 Starting periodic content sync")
                        threading.Thread(target=self.sync_and_play_content, daemon=True).start()
            except KeyboardInterrupt:
                self.logger.info("🛑 Received interrupt signal")
                pass
        else:
            self.logger.info("❌ Device not paired, starting pairing process")
            self.start_pairing_loop()
            
            if self.is_paired:
                self.logger.info("🎉 Pairing successful, starting content playback")
                self.start_content_playback()
                
                # Keep running after successful pairing
                try:
                    self.logger.info("📺 Entering main content loop after pairing")
                    while True:
                        time.sleep(60)
                except KeyboardInterrupt:
                    self.logger.info("🛑 Received interrupt signal")
                    pass

    def cleanup(self):
        """Cleanup resources"""
        print("Cleaning up...")
        
        # Stop media playback
        if self.media_player:
            self.media_player.cleanup()
        
        # Stop API services
        if self.api_client:
            self.api_client.stop_services()
        
        # Stop display process
        if self.current_display_process:
            try:
                self.current_display_process.terminate()
                self.current_display_process.wait(timeout=5)
            except:
                try:
                    self.current_display_process.kill()
                except:
                    pass


def signal_handler(signum, frame):
    print(f"\nReceived signal {signum}, shutting down...")
    if hasattr(signal_handler, 'display_manager'):
        signal_handler.display_manager.cleanup()
    sys.exit(0)


def main():
    # Setup logging first
    logger = setup_logging()
    logger.info("=" * 60)
    logger.info("MESOPHY PI CLIENT STARTING")
    logger.info("=" * 60)
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        display_manager = NativeDisplayManager()
        signal_handler.display_manager = display_manager
        display_manager.run()
    except Exception as e:
        logger.error(f"💥 FATAL ERROR: {e}")
        logger.error(f"Exception details: {e.__class__.__name__}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        sys.exit(1)


if __name__ == "__main__":
    main()