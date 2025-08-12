"""
Display Manager for Mesophy Pi Client
Handles all HDMI display output using direct framebuffer access
"""

import os
import subprocess
import tempfile
import logging
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

class DisplayManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.display_config = config.get('display', {})
        self.width = self.display_config.get('width', 1920)
        self.height = self.display_config.get('height', 1080)
        self.temp_dir = '/tmp/mesophy-display'
        
        # Create temp directory for generated images
        os.makedirs(self.temp_dir, exist_ok=True)
        
        # Colors
        self.bg_color = (0, 31, 63)      # Dark blue
        self.text_color = (255, 255, 255)  # White
        self.accent_color = (0, 150, 255)  # Light blue
        
    def show_pairing_code(self, pairing_code):
        """Display pairing code on HDMI screen"""
        self.logger.info(f"Displaying pairing code: {pairing_code}")
        
        # Create pairing code image
        image = self._create_pairing_image(pairing_code)
        self._display_image(image, "pairing_code.png")
    
    def show_waiting_for_media(self):
        """Display 'waiting for media' message"""
        self.logger.info("Displaying waiting for media message")
        
        image = self._create_message_image(
            "Waiting for Content",
            "Your screen is paired and ready.\nContent will appear when scheduled."
        )
        self._display_image(image, "waiting.png")
    
    def show_content(self, content_info):
        """Display media content"""
        content_path = content_info.get('path')
        content_type = content_info.get('type')
        
        if content_type == 'image':
            self._display_image_file(content_path)
        elif content_type == 'video':
            self._display_video_file(content_path)
        else:
            self.logger.error(f"Unknown content type: {content_type}")
    
    def show_error(self, error_message):
        """Display error message"""
        self.logger.info(f"Displaying error: {error_message}")
        
        image = self._create_message_image(
            "Error",
            error_message,
            text_color=(255, 100, 100)  # Light red
        )
        self._display_image(image, "error.png")
    
    def cleanup(self):
        """Clean up display processes"""
        try:
            # Kill any running fbi processes
            subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True)
            
            # Clear framebuffer
            subprocess.run([
                'sudo', 'dd', 'if=/dev/zero', 'of=/dev/fb0', 
                'bs=1M', 'count=1'
            ], capture_output=True)
            
        except Exception as e:
            self.logger.error(f"Error during cleanup: {e}")
    
    def _create_pairing_image(self, pairing_code):
        """Create beautiful pairing code display image"""
        # Create image
        image = Image.new('RGB', (self.width, self.height), self.bg_color)
        draw = ImageDraw.Draw(image)
        
        # Try to load fonts, fallback to default if not available
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
            code_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 200)
            subtitle_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 50)
            instruction_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 40)
        except:
            # Fallback to default font
            title_font = ImageFont.load_default()
            code_font = ImageFont.load_default()
            subtitle_font = ImageFont.load_default()
            instruction_font = ImageFont.load_default()
        
        # Draw title
        title = "MESOPHY DIGITAL SIGNAGE"
        try:
            # New PIL versions (10.0.0+)
            title_bbox = draw.textbbox((0, 0), title, font=title_font)
            title_width = title_bbox[2] - title_bbox[0]
        except AttributeError:
            # Older PIL versions
            title_width = draw.textsize(title, font=title_font)[0]
        
        title_x = (self.width - title_width) // 2
        draw.text((title_x, 150), title, fill=self.text_color, font=title_font)
        
        # Draw pairing code (large and centered)
        try:
            # New PIL versions (10.0.0+)
            code_bbox = draw.textbbox((0, 0), pairing_code, font=code_font)
            code_width = code_bbox[2] - code_bbox[0]
        except AttributeError:
            # Older PIL versions
            code_width = draw.textsize(pairing_code, font=code_font)[0]
        code_x = (self.width - code_width) // 2
        code_y = (self.height - 300) // 2
        
        # Draw code background
        padding = 40
        draw.rectangle([
            code_x - padding, code_y - padding,
            code_x + code_width + padding, code_y + 200 + padding
        ], fill=self.accent_color)
        
        draw.text((code_x, code_y), pairing_code, fill=self.text_color, font=code_font)
        
        # Draw instructions
        instructions = [
            "1. Go to your Mesophy dashboard",
            "2. Navigate to Screens → Pair Device",
            f"3. Enter pairing code: {pairing_code}",
            "4. Assign this device to a screen"
        ]
        
        instruction_y = code_y + 300
        for i, instruction in enumerate(instructions):
            try:
                # New PIL versions (10.0.0+)
                inst_bbox = draw.textbbox((0, 0), instruction, font=instruction_font)
                inst_width = inst_bbox[2] - inst_bbox[0]
            except AttributeError:
                # Older PIL versions
                inst_width = draw.textsize(instruction, font=instruction_font)[0]
            
            inst_x = (self.width - inst_width) // 2
            draw.text((inst_x, instruction_y + i * 60), instruction, 
                     fill=self.text_color, font=instruction_font)
        
        # Draw URL at bottom
        url = "https://mesophy.vercel.app"
        try:
            # New PIL versions (10.0.0+)
            url_bbox = draw.textbbox((0, 0), url, font=subtitle_font)
            url_width = url_bbox[2] - url_bbox[0]
        except AttributeError:
            # Older PIL versions
            url_width = draw.textsize(url, font=subtitle_font)[0]
        
        url_x = (self.width - url_width) // 2
        draw.text((url_x, self.height - 100), url, fill=self.accent_color, font=subtitle_font)
        
        return image
    
    def _create_message_image(self, title, message, text_color=None):
        """Create a message display image"""
        if text_color is None:
            text_color = self.text_color
            
        # Create image
        image = Image.new('RGB', (self.width, self.height), self.bg_color)
        draw = ImageDraw.Draw(image)
        
        # Try to load fonts
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 100)
            message_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 60)
        except:
            title_font = ImageFont.load_default()
            message_font = ImageFont.load_default()
        
        # Draw title
        try:
            # New PIL versions (10.0.0+)
            title_bbox = draw.textbbox((0, 0), title, font=title_font)
            title_width = title_bbox[2] - title_bbox[0]
        except AttributeError:
            # Older PIL versions
            title_width = draw.textsize(title, font=title_font)[0]
        
        title_x = (self.width - title_width) // 2
        title_y = (self.height // 2) - 150
        draw.text((title_x, title_y), title, fill=text_color, font=title_font)
        
        # Draw message (handle multiline)
        message_lines = message.split('\n')
        message_y = title_y + 150
        
        for i, line in enumerate(message_lines):
            try:
                # New PIL versions (10.0.0+)
                line_bbox = draw.textbbox((0, 0), line, font=message_font)
                line_width = line_bbox[2] - line_bbox[0]
            except AttributeError:
                # Older PIL versions
                line_width = draw.textsize(line, font=message_font)[0]
            
            line_x = (self.width - line_width) // 2
            draw.text((line_x, message_y + i * 80), line, fill=text_color, font=message_font)
        
        return image
    
    def _display_image(self, image, filename):
        """Display PIL image using FBI framebuffer viewer"""
        try:
            # Save image to temp file
            image_path = os.path.join(self.temp_dir, filename)
            image.save(image_path, 'PNG')
            
            # Display using FBI
            self._display_image_file(image_path)
            
        except Exception as e:
            self.logger.error(f"Failed to display image: {e}")
    
    def _display_image_file(self, image_path):
        """Display image file using FBI"""
        try:
            # Kill any existing fbi processes
            subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True)
            
            # Display image with FBI
            cmd = [
                'sudo', 'fbi',
                '-d', '/dev/fb0',  # Framebuffer device
                '-T', '1',         # Use virtual terminal 1
                '-noverbose',      # Quiet output
                '-a',              # Auto zoom to fit screen
                image_path
            ]
            
            # Run FBI in background
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            self.logger.info(f"Displaying image: {image_path}")
            
        except Exception as e:
            self.logger.error(f"Failed to display image file: {e}")
    
    def _display_video_file(self, video_path):
        """Display video file using omxplayer"""
        try:
            # Kill any existing video processes
            subprocess.run(['sudo', 'pkill', '-f', 'omxplayer'], capture_output=True)
            subprocess.run(['sudo', 'pkill', '-f', 'vlc'], capture_output=True)
            
            # Try omxplayer first (hardware accelerated on Pi)
            if self._command_exists('omxplayer'):
                cmd = [
                    'omxplayer',
                    '--no-osd',        # No on-screen display
                    '--loop',          # Loop video
                    '--blank',         # Blank screen before playback
                    video_path
                ]
            else:
                # Fallback to VLC
                cmd = [
                    'vlc',
                    '--intf', 'dummy',     # No interface
                    '--fullscreen',        # Fullscreen mode
                    '--loop',              # Loop video
                    '--no-audio',          # No audio (optional)
                    video_path
                ]
            
            # Run video player in background
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            self.logger.info(f"Playing video: {video_path}")
            
        except Exception as e:
            self.logger.error(f"Failed to play video: {e}")
    
    def _command_exists(self, command):
        """Check if command exists in system PATH"""
        try:
            subprocess.run(['which', command], check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError:
            return False