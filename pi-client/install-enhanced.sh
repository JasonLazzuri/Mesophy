#!/bin/bash
# Install enhanced Pi client directly
echo "🚀 Installing Enhanced Mesophy Pi Client"
echo "======================================="

# Stop any running processes
sudo pkill -f "python3.*native-display" || true
sleep 2

# Clean up old images
echo "Cleaning up old pairing images..."
find /opt/mesophy/temp/ -name "pairing_screen_*.png" -delete 2>/dev/null || true

# Backup current client
if [ -f "/opt/mesophy/native-display.py" ]; then
    sudo cp /opt/mesophy/native-display.py /opt/mesophy/native-display.py.backup
fi

echo "Creating enhanced client..."

sudo tee /opt/mesophy/native-display.py > /dev/null << 'EOF'
#!/usr/bin/env python3
"""
Enhanced Mesophy Pi Client with X11 fixes and robust display
"""
import os, sys, time, json, subprocess, requests, logging
from PIL import Image, ImageDraw, ImageFont

# Configuration
CONFIG_PATH = '/opt/mesophy/config/config.json'
DEVICE_CONFIG_PATH = '/opt/mesophy/config/device.json'
TEMP_DIR = '/opt/mesophy/temp'
LOG_DIR = '/opt/mesophy/logs'

def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f'{LOG_DIR}/enhanced-display.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

class EnhancedDisplayManager:
    def __init__(self):
        self.logger = setup_logging()
        self.logger.info("🚀 ENHANCED PI CLIENT STARTING")
        
        self.display_width = 1920
        self.display_height = 1080
        self.api_base = 'https://mesophy.vercel.app'
        self.current_pairing_code = None
        self.is_paired = False
        self.current_process = None
        
        os.makedirs(TEMP_DIR, exist_ok=True)
        self.load_device_config()

    def load_device_config(self):
        if os.path.exists(DEVICE_CONFIG_PATH):
            try:
                with open(DEVICE_CONFIG_PATH, 'r') as f:
                    self.device_config = json.load(f)
                    self.is_paired = True
                    self.logger.info(f"✅ Device paired: {self.device_config.get('screen_name')}")
            except:
                self.is_paired = False

    def generate_pairing_screen(self, code):
        self.logger.info(f"📝 Generating pairing screen: {code}")
        
        img = Image.new('RGB', (self.display_width, self.display_height), 'black')
        draw = ImageDraw.Draw(img)
        
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
            code_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 140)
        except:
            title_font = ImageFont.load_default()
            code_font = ImageFont.load_default()
        
        # Colors
        white, blue, gray = (255,255,255), (79,70,229), (107,114,128)
        center_x = self.display_width // 2
        
        # Title
        title = "MESOPHY DIGITAL SIGNAGE"
        try:
            bbox = draw.textbbox((0,0), title, font=title_font)
            width = bbox[2] - bbox[0]
        except:
            width = len(title) * 40
        draw.text((center_x - width//2, 150), title, fill=blue, font=title_font)
        
        # Subtitle
        subtitle = "ENHANCED CLIENT - Device Setup Required"
        try:
            bbox = draw.textbbox((0,0), subtitle, font=title_font)
            width = bbox[2] - bbox[0]
        except:
            width = len(subtitle) * 20
        draw.text((center_x - width//2, 280), subtitle, fill=gray, font=title_font)
        
        # Code box
        try:
            bbox = draw.textbbox((0,0), code, font=code_font)
            code_width = bbox[2] - bbox[0]
            code_height = bbox[3] - bbox[1]
        except:
            code_width = len(code) * 80
            code_height = 140
        
        box_y = 400
        draw.rectangle([center_x - code_width//2 - 30, box_y - 30, 
                       center_x + code_width//2 + 30, box_y + code_height + 30], 
                      fill=(31,41,55), outline=blue, width=4)
        draw.text((center_x - code_width//2, box_y), code, fill=white, font=code_font)
        
        # Instructions
        instructions = [
            "1. Go to mesophy.vercel.app",
            "2. Login and navigate to Screens", 
            "3. Click 'Pair Device'",
            "4. Enter the code above"
        ]
        
        y_pos = 650
        for inst in instructions:
            try:
                bbox = draw.textbbox((0,0), inst, font=title_font)
                width = bbox[2] - bbox[0]
            except:
                width = len(inst) * 20
            draw.text((center_x - width//2, y_pos), inst, fill=white, font=title_font)
            y_pos += 60
        
        image_path = f'{TEMP_DIR}/pairing_screen_{code}.png'
        img.save(image_path)
        self.logger.info(f"💾 Pairing screen saved: {image_path}")
        return image_path

    def display_image(self, image_path):
        self.logger.info(f"🖼️ ENHANCED: Displaying {os.path.basename(image_path)}")
        
        # Kill existing process
        if self.current_process:
            try:
                self.current_process.terminate()
                self.current_process.wait(timeout=3)
            except:
                try:
                    self.current_process.kill()
                except:
                    pass
        
        debug_mode = os.environ.get('MESOPHY_DEBUG', '').lower() in ['true', '1']
        
        if debug_mode:
            self.logger.info("🐛 DEBUG MODE: Showing in VNC window")
            env = os.environ.copy()
            env['DISPLAY'] = ':0'
            
            # ENHANCED X11 permission fixes
            if os.geteuid() == 0:
                self.logger.info("🔧 Applying X11 permission fixes...")
                try:
                    subprocess.run(['xhost', '+local:'], env=env, capture_output=True)
                    if os.path.exists('/home/pi/.Xauthority'):
                        env['XAUTHORITY'] = '/home/pi/.Xauthority'
                    subprocess.run(['xhost', '+si:localuser:pi'], env=env, capture_output=True)
                    subprocess.run(['xhost', '+si:localuser:root'], env=env, capture_output=True)
                    self.logger.info("✅ X11 permissions fixed")
                except Exception as e:
                    self.logger.warning(f"⚠️ X11 fix failed: {e}")
            
            # Try enhanced VNC-compatible viewers
            viewers = [
                ['eog', '--fullscreen', image_path],
                ['gpicview', '--fullscreen', image_path], 
                ['feh', '--fullscreen', '--auto-zoom', image_path],
                ['pcmanfm', image_path]
            ]
            
            for cmd in viewers:
                try:
                    if subprocess.run(['which', cmd[0]], capture_output=True).returncode == 0:
                        self.logger.info(f"🧪 Trying {cmd[0]}...")
                        self.current_process = subprocess.Popen(cmd, env=env, 
                                                              stdout=subprocess.PIPE, 
                                                              stderr=subprocess.PIPE)
                        time.sleep(3)
                        if self.current_process.poll() is None:
                            self.logger.info(f"✅ SUCCESS: {cmd[0]} running!")
                            return
                        else:
                            _, stderr = self.current_process.communicate()
                            self.logger.warning(f"❌ {cmd[0]} failed: {stderr.decode().strip()}")
                except Exception as e:
                    self.logger.warning(f"❌ {cmd[0]} error: {e}")
            
            # Desktop fallback
            try:
                subprocess.run(['cp', image_path, '/home/pi/Desktop/pairing_screen.png'])
                self.logger.info("📋 Image copied to desktop for manual viewing")
            except:
                pass
        
        # ENHANCED framebuffer mode
        self.logger.info("📺 FRAMEBUFFER MODE: Direct HDMI display")
        
        if not os.path.exists('/dev/fb0'):
            self.logger.error("❌ No framebuffer device found")
            return
        
        # Enhanced fbi methods
        fbi_methods = [
            ['fbi', '-d', '/dev/fb0', '-T', '1', '--noverbose', '-a', '--once', image_path],
            ['fbi', '-d', '/dev/fb0', '-T', '1', '--noverbose', '-a', image_path],
            ['fbi', '-T', '1', '--noverbose', '-a', image_path]
        ]
        
        for cmd in fbi_methods:
            try:
                self.logger.info(f"🧪 Trying fbi: {' '.join(cmd[5:])}")  # Show relevant parts
                self.current_process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                time.sleep(2)
                
                if self.current_process.poll() is None:
                    self.logger.info("✅ SUCCESS: fbi running (persistent mode)")
                    return
                else:
                    _, stderr = self.current_process.communicate()
                    stderr_text = stderr.decode().strip()
                    if 'using' in stderr_text or 'font' in stderr_text:
                        self.logger.info("✅ SUCCESS: fbi completed (image displayed)")
                        return
                    else:
                        self.logger.warning(f"❌ fbi method failed: {stderr_text}")
            except Exception as e:
                self.logger.warning(f"❌ fbi error: {e}")
        
        self.logger.info("✅ ENHANCED display methods completed")

    def generate_pairing_code(self):
        try:
            url = f"{self.api_base}/api/devices/generate-code"
            response = requests.post(url, json={'device_info': {}}, timeout=10)
            if response.status_code in [200, 201]:
                data = response.json()
                code = data['pairing_code']
                self.logger.info(f"📞 Generated pairing code: {code}")
                return code
            else:
                self.logger.error(f"❌ API error: {response.status_code}")
        except Exception as e:
            self.logger.error(f"❌ Generate code failed: {e}")
        return None

    def check_pairing(self, code):
        try:
            url = f"{self.api_base}/api/devices/check-pairing/{code}"
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('paired') and data.get('device_config'):
                    self.logger.info("🎉 DEVICE PAIRED SUCCESSFULLY!")
                    os.makedirs(os.path.dirname(DEVICE_CONFIG_PATH), exist_ok=True)
                    with open(DEVICE_CONFIG_PATH, 'w') as f:
                        json.dump(data['device_config'], f)
                    self.is_paired = True
                    return True
        except Exception as e:
            self.logger.error(f"❌ Check pairing failed: {e}")
        return False

    def run(self):
        if self.is_paired:
            self.logger.info("✅ Already paired - showing status")
            # Could show content here
            while True:
                time.sleep(60)
        
        self.logger.info("🔄 Starting pairing process...")
        while not self.is_paired:
            code = self.generate_pairing_code()
            if code:
                self.current_pairing_code = code
                image_path = self.generate_pairing_screen(code)
                self.display_image(image_path)
                
                # Check every 10 seconds for pairing
                for _ in range(30):  # 5 minutes total
                    time.sleep(10)
                    if self.check_pairing(code):
                        self.logger.info("🎉 Pairing successful!")
                        return
                
                self.logger.info("🔄 Code expired, generating new one...")
            else:
                self.logger.error("❌ Could not generate code, waiting...")
                time.sleep(30)

if __name__ == "__main__":
    manager = EnhancedDisplayManager()
    manager.run()
EOF

sudo chmod +x /opt/mesophy/native-display.py
echo "✅ Enhanced Pi client installed!"
echo ""
echo "Test with: sudo MESOPHY_DEBUG=true python3 native-display.py"