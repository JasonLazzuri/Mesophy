"""
Display Manager for Mesophy Pi Client - Professional Design
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
        
        # Colors - Professional design palette
        self.bg_color = (20, 25, 40)       # Dark blue background
        self.text_color = (255, 255, 255)  # White text
        self.accent_color = (0, 150, 255)  # Blue accent
        self.highlight_color = (0, 150, 255)  # Blue highlight (instead of orange)
        self.footer_color = (150, 150, 150)  # Gray for footer
        
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
        filename = content_info.get('filename', 'unknown')
        
        self.logger.info(f"Showing content: {filename} (type: {content_type}, path: {content_path})")
        
        if content_type == 'image':
            self._display_image_file(content_path)
        elif content_type == 'video':
            self.logger.info(f"Playing video: {filename}")
            self._display_video_file(content_path)
        else:
            self.logger.error(f"Unknown content type: {content_type} for file: {filename}")
            # Fallback to image display for unknown types
            self._display_image_file(content_path)
    
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
        """Create professional pairing code display image"""
        # Create image
        image = Image.new('RGB', (self.width, self.height), self.bg_color)
        draw = ImageDraw.Draw(image)
        
        # Load fonts with better sizing
        try:
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 72)
            heading_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 48)
            body_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 36)
            code_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 64)
        except:
            # Fallback to default font
            title_font = ImageFont.load_default()
            heading_font = ImageFont.load_default()
            body_font = ImageFont.load_default()
            code_font = ImageFont.load_default()
        
        # Title with emoji
        title_text = "🔗 Device Pairing Required"
        try:
            title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
            title_width = title_bbox[2] - title_bbox[0]
        except AttributeError:
            title_width = draw.textsize(title_text, font=title_font)[0]
        
        draw.text(((self.width - title_width) // 2, 80), title_text, fill=self.accent_color, font=title_font)
        
        # Subtitle
        subtitle_text = "This Pi device needs to be paired with a screen in the admin portal"
        try:
            subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=body_font)
            subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
        except AttributeError:
            subtitle_width = draw.textsize(subtitle_text, font=body_font)[0]
        
        draw.text(((self.width - subtitle_width) // 2, 180), subtitle_text, fill=self.text_color, font=body_font)
        
        # Pairing Code section
        code_heading = "Pairing Code:"
        try:
            code_heading_bbox = draw.textbbox((0, 0), code_heading, font=heading_font)
            code_heading_width = code_heading_bbox[2] - code_heading_bbox[0]
        except AttributeError:
            code_heading_width = draw.textsize(code_heading, font=heading_font)[0]
        
        draw.text(((self.width - code_heading_width) // 2, 280), code_heading, fill=self.text_color, font=heading_font)
        
        # Pairing code with highlighted background
        try:
            code_bbox = draw.textbbox((0, 0), pairing_code, font=code_font)
            code_width = code_bbox[2] - code_bbox[0]
            code_height = code_bbox[3] - code_bbox[1]
        except AttributeError:
            code_size = draw.textsize(pairing_code, font=code_font)
            code_width = code_size[0]
            code_height = code_size[1]
        
        # Draw background box for pairing code
        box_padding = 20
        box_x = (self.width - code_width) // 2 - box_padding
        box_y = 360 - box_padding
        box_width = code_width + 2 * box_padding
        box_height = code_height + 2 * box_padding
        
        # Create rounded rectangle background
        try:
            draw.rounded_rectangle([box_x, box_y, box_x + box_width, box_y + box_height], 
                                   radius=10, fill=self.highlight_color)
        except AttributeError:
            # Fallback for older PIL versions
            draw.rectangle([box_x, box_y, box_x + box_width, box_y + box_height], 
                          fill=self.highlight_color)
        
        draw.text(((self.width - code_width) // 2, 360), pairing_code, fill=self.text_color, font=code_font)
        
        # Instructions with emojis
        instructions = [
            "📋 How to pair this device:",
            "",
            "1. Open the Mesophy admin portal in your web browser",
            "2. Navigate to Dashboard → Screens → Pair Device", 
            f"3. Enter the pairing code: {pairing_code}",
            "4. Assign the device to a screen and location",
            "5. The device will automatically start displaying content"
        ]
        
        y_offset = 500
        for instruction in instructions:
            if instruction == "📋 How to pair this device:":
                # Section heading
                try:
                    instr_bbox = draw.textbbox((0, 0), instruction, font=heading_font)
                    instr_width = instr_bbox[2] - instr_bbox[0]
                except AttributeError:
                    instr_width = draw.textsize(instruction, font=heading_font)[0]
                
                draw.text(((self.width - instr_width) // 2, y_offset), instruction, fill=self.accent_color, font=heading_font)
                y_offset += 60
            elif instruction == "":
                y_offset += 20
            else:
                # Regular instruction
                draw.text((200, y_offset), instruction, fill=self.text_color, font=body_font)
                y_offset += 50
        
        # Portal URL
        url_text = "Portal: https://mesophy.vercel.app"
        try:
            url_bbox = draw.textbbox((0, 0), url_text, font=body_font)
            url_width = url_bbox[2] - url_bbox[0]
        except AttributeError:
            url_width = draw.textsize(url_text, font=body_font)[0]
        
        draw.text(((self.width - url_width) // 2, self.height - 120), url_text, fill=self.accent_color, font=body_font)
        
        # Footer
        footer_text = "Mesophy Digital Signage Platform - Waiting for pairing..."
        try:
            footer_bbox = draw.textbbox((0, 0), footer_text, font=body_font)
            footer_width = footer_bbox[2] - footer_bbox[0]
        except AttributeError:
            footer_width = draw.textsize(footer_text, font=body_font)[0]
        
        draw.text(((self.width - footer_width) // 2, self.height - 60), footer_text, fill=self.footer_color, font=body_font)
        
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
        """Display video file using omxplayer or vlc"""
        try:
            if not os.path.exists(video_path):
                self.logger.error(f"Video file not found: {video_path}")
                return False
            
            # Kill any existing video processes
            subprocess.run(['sudo', 'pkill', '-f', 'omxplayer'], capture_output=True)
            subprocess.run(['sudo', 'pkill', '-f', 'vlc'], capture_output=True)
            subprocess.run(['sudo', 'pkill', '-f', 'cvlc'], capture_output=True)
            
            # Try different video players in order of preference
            video_players = [
                # omxplayer (hardware accelerated on Pi)
                {
                    'command': 'omxplayer',
                    'args': ['--no-osd', '--blank', '--aspect-mode', 'fill', video_path]
                },
                # VLC command line
                {
                    'command': 'cvlc',
                    'args': ['--intf', 'dummy', '--fullscreen', '--no-audio', '--play-and-exit', video_path]
                },
                # VLC GUI (fallback)
                {
                    'command': 'vlc',
                    'args': ['--intf', 'dummy', '--fullscreen', '--no-audio', '--play-and-exit', video_path]
                }
            ]
            
            for player in video_players:
                if self._command_exists(player['command']):
                    try:
                        self.logger.info(f"Trying to play video with {player['command']}: {video_path}")
                        
                        # Run video player
                        process = subprocess.Popen(
                            [player['command']] + player['args'],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE
                        )
                        
                        self.logger.info(f"Started video player: {player['command']}")
                        return True
                        
                    except Exception as e:
                        self.logger.warning(f"Failed to start {player['command']}: {e}")
                        continue
                else:
                    self.logger.debug(f"Video player not available: {player['command']}")
            
            # If no video player worked, show error
            self.logger.error(f"No suitable video player found for: {video_path}")
            self.show_error(f"Cannot play video: {os.path.basename(video_path)}")
            return False
            
        except Exception as e:
            self.logger.error(f"Failed to play video: {e}")
            return False
    
    def _command_exists(self, command):
        """Check if command exists in system PATH"""
        try:
            subprocess.run(['which', command], check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError:
            return False