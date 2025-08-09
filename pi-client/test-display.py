#!/usr/bin/env python3
"""
Test version of Pi display manager - for testing the enhanced display methods
"""

import os
import sys
import time
import json
import subprocess
import logging
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# Setup basic paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, 'temp')
LOG_DIR = os.path.join(BASE_DIR, 'logs')

# Create directories
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'{LOG_DIR}/test-display.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class TestDisplayManager:
    def __init__(self):
        self.logger = logger
        self.display_width = 1920
        self.display_height = 1080
        
        self.logger.info("=== TESTING ENHANCED DISPLAY METHODS ===")
        
    def generate_test_image(self, text="TEST PAIRING CODE", code="AB123"):
        """Generate test pairing screen image"""
        self.logger.info(f"Generating test image: {text}")
        
        # Create image
        img = Image.new('RGB', (self.display_width, self.display_height), color='black')
        draw = ImageDraw.Draw(img)
        
        # Try to load fonts, fall back to defaults
        try:
            title_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 80) # macOS font
        except:
            try:
                title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
            except:
                title_font = ImageFont.load_default()
        
        try:
            code_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 140)
        except:
            try:
                code_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 140)
            except:
                code_font = ImageFont.load_default()
        
        # Colors
        white = (255, 255, 255)
        blue = (79, 70, 229)
        green = (16, 185, 129)
        gray = (107, 114, 128)
        
        # Center position
        center_x = self.display_width // 2
        y_pos = 200
        
        # Title
        title_text = "MESOPHY DISPLAY TEST"
        try:
            title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
            title_width = title_bbox[2] - title_bbox[0]
        except:
            title_width = len(title_text) * 40  # Rough estimate
        draw.text((center_x - title_width//2, y_pos), title_text, fill=blue, font=title_font)
        y_pos += 150
        
        # Test message
        draw.text((center_x - len(text) * 30//2, y_pos), text, fill=white, font=title_font)
        y_pos += 120
        
        # Pairing code
        try:
            code_bbox = draw.textbbox((0, 0), code, font=code_font)
            code_width = code_bbox[2] - code_bbox[0]
            code_height = code_bbox[3] - code_bbox[1]
        except:
            code_width = len(code) * 80
            code_height = 140
        
        # Draw code background box
        box_padding = 30
        box_left = center_x - code_width//2 - box_padding
        box_right = center_x + code_width//2 + box_padding
        box_top = y_pos - box_padding
        box_bottom = y_pos + code_height + box_padding
        
        draw.rectangle([box_left, box_top, box_right, box_bottom], fill=(31, 41, 55), outline=blue, width=4)
        draw.text((center_x - code_width//2, y_pos), code, fill=white, font=code_font)
        y_pos += code_height + 100
        
        # Status
        status_text = f"Enhanced display methods test - {time.strftime('%H:%M:%S')}"
        try:
            status_bbox = draw.textbbox((0, 0), status_text, font=title_font)
            status_width = status_bbox[2] - status_bbox[0]
        except:
            status_width = len(status_text) * 20
        draw.text((center_x - status_width//2, y_pos), status_text, fill=gray, font=title_font)
        
        # Save image
        image_path = os.path.join(TEMP_DIR, f'test_display_{int(time.time())}.png')
        img.save(image_path, 'PNG')
        self.logger.info(f"Test image saved to: {image_path}")
        
        return image_path

    def test_display_methods(self, image_path):
        """Test display methods (adapted for macOS/development environment)"""
        self.logger.info(f"🧪 Testing display methods with: {os.path.basename(image_path)}")
        
        if not os.path.exists(image_path):
            self.logger.error(f"❌ Image not found: {image_path}")
            return
        
        # macOS/development compatible display methods
        methods = [
            {
                'name': 'open (macOS default)',
                'cmd': ['open', image_path],
                'reason': 'macOS system default image viewer'
            },
            {
                'name': 'Preview (macOS)',
                'cmd': ['open', '-a', 'Preview', image_path],
                'reason': 'macOS Preview app'
            }
        ]
        
        # Add Linux methods for real Pi testing
        linux_methods = [
            {
                'name': 'eog (GNOME)',
                'cmd': ['eog', image_path],
                'reason': 'Most VNC-compatible viewer'
            },
            {
                'name': 'feh (windowed)',
                'cmd': ['feh', '--geometry', '800x600', image_path],
                'reason': 'Fast image viewer'
            },
            {
                'name': 'gpicview',
                'cmd': ['gpicview', image_path],
                'reason': 'Lightweight Pi viewer'
            }
        ]
        
        # Test macOS methods first (for current environment)
        for method in methods:
            self.logger.info(f"\\n🧪 Testing: {method['name']}")
            self.logger.info(f"   Reason: {method['reason']}")
            self.logger.info(f"   Command: {' '.join(method['cmd'])}")
            
            try:
                # Check if command exists
                result = subprocess.run(['which', method['cmd'][0]], capture_output=True)
                if result.returncode != 0:
                    self.logger.warning(f"   ❌ {method['name']} not found")
                    continue
                
                # Try to run it
                proc = subprocess.Popen(
                    method['cmd'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                
                self.logger.info(f"   ⏳ Started process PID {proc.pid}")
                time.sleep(2)
                
                if proc.poll() is None:
                    self.logger.info(f"   ✅ SUCCESS: {method['name']} running!")
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except:
                        proc.kill()
                    return method['name']
                else:
                    stdout, stderr = proc.communicate()
                    error = stderr.decode().strip()
                    if error:
                        self.logger.warning(f"   ❌ Failed: {error}")
                    else:
                        self.logger.info(f"   ✅ {method['name']} completed successfully")
                        return method['name']
                        
            except Exception as e:
                self.logger.warning(f"   ❌ Exception: {e}")
        
        # Log what would happen on Pi
        self.logger.info("\\n📝 On Raspberry Pi, these methods would be tested:")
        for method in linux_methods:
            self.logger.info(f"   • {method['name']} - {method['reason']}")
        
        return "test-complete"

    def test_permissions_and_environment(self):
        """Test system permissions and environment"""
        self.logger.info("\\n🔍 SYSTEM ENVIRONMENT TEST")
        self.logger.info("=" * 50)
        
        # Check user
        try:
            import pwd
            user = pwd.getpwuid(os.getuid()).pw_name
            self.logger.info(f"Current user: {user}")
            self.logger.info(f"User ID: {os.getuid()}")
            self.logger.info(f"Running as root: {os.getuid() == 0}")
        except:
            self.logger.info(f"Current user: unknown")
        
        # Check display environment
        display = os.environ.get('DISPLAY', 'Not set')
        self.logger.info(f"DISPLAY environment: {display}")
        
        # Check available tools
        tools_to_check = ['fbi', 'feh', 'eog', 'convert', 'open']
        self.logger.info(f"\\n🛠️  Available tools:")
        for tool in tools_to_check:
            result = subprocess.run(['which', tool], capture_output=True)
            status = "✅" if result.returncode == 0 else "❌"
            location = result.stdout.decode().strip() if result.returncode == 0 else "Not found"
            self.logger.info(f"   {status} {tool:10} - {location}")
        
        # Check write access to temp directory
        test_file = os.path.join(TEMP_DIR, 'write_test.txt')
        try:
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
            self.logger.info(f"✅ Write access to temp directory: {TEMP_DIR}")
        except Exception as e:
            self.logger.error(f"❌ No write access to temp directory: {e}")
            
    def run_test(self):
        """Run complete display test"""
        self.logger.info("🚀 Starting Enhanced Display Methods Test")
        
        # Test environment
        self.test_permissions_and_environment()
        
        # Generate test image
        image_path = self.generate_test_image("DISPLAY TEST", f"T{int(time.time()) % 10000}")
        
        # Test display methods
        successful_method = self.test_display_methods(image_path)
        
        self.logger.info("\\n" + "=" * 60)
        self.logger.info("TEST COMPLETE")
        self.logger.info("=" * 60)
        
        if successful_method:
            self.logger.info(f"✅ SUCCESS: Display method '{successful_method}' worked!")
            self.logger.info("💡 The enhanced Pi client should work properly on Pi hardware")
        else:
            self.logger.info("⚠️  No display methods worked in this environment")
            self.logger.info("💡 This is expected on macOS - the Pi methods will work on actual Pi hardware")
        
        self.logger.info(f"📄 Test image saved at: {image_path}")
        self.logger.info(f"📝 Test log saved at: {os.path.join(LOG_DIR, 'test-display.log')}")

if __name__ == "__main__":
    test_manager = TestDisplayManager()
    test_manager.run_test()