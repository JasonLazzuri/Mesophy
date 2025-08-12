#!/usr/bin/env python3
"""
Mesophy Pi Client - 3rd Attempt
Simple, reliable digital signage client for Raspberry Pi

States:
- NOT_PAIRED: Show pairing code on HDMI screen
- WAITING_FOR_MEDIA: Show "waiting for content" message
- PLAYING_CONTENT: Display scheduled media content
"""

import os
import sys
import time
import json
import logging
import argparse
from pathlib import Path

# Add lib directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'lib'))

from display_manager import DisplayManager
from api_client import APIClient
from state_manager import StateManager
from content_manager import ContentManager

class MesophyPiClient:
    def __init__(self, config_path="/opt/mesophy/config/client.conf"):
        self.config_path = config_path
        self.config = self.load_config()
        self.setup_logging()
        
        # Initialize components
        self.display = DisplayManager(self.config)
        self.api = APIClient(self.config)
        self.state = StateManager(self.config)
        self.content = ContentManager(self.config)
        
        self.logger = logging.getLogger(__name__)
        self.running = False
        
    def load_config(self):
        """Load configuration from file"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"Warning: Could not load config: {e}")
        
        # Default configuration
        return {
            "api_base_url": "https://mesophy.vercel.app",
            "device_id": None,
            "screen_id": None,
            "pairing_code": None,
            "cache_dir": "/opt/mesophy/content",
            "log_level": "INFO",
            "display": {
                "width": 1920,
                "height": 1080,
                "fullscreen": True
            }
        }
    
    def save_config(self):
        """Save current configuration to file"""
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            self.logger.error(f"Failed to save config: {e}")
    
    def setup_logging(self):
        """Configure logging"""
        log_level = getattr(logging, self.config.get('log_level', 'INFO'))
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('/opt/mesophy/logs/pi-client.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        
        # Create log directory
        os.makedirs('/opt/mesophy/logs', exist_ok=True)
    
    def run(self):
        """Main application loop"""
        self.running = True
        self.logger.info("Mesophy Pi Client starting...")
        
        try:
            while self.running:
                current_state = self.state.get_current_state(self.content)
                self.logger.info(f"Current state: {current_state}")
                
                if current_state == "NOT_PAIRED":
                    self.handle_not_paired()
                elif current_state == "WAITING_FOR_MEDIA":
                    self.handle_waiting_for_media()
                elif current_state == "PLAYING_CONTENT":
                    self.handle_playing_content()
                else:
                    self.logger.error(f"Unknown state: {current_state}")
                    time.sleep(10)
                
        except KeyboardInterrupt:
            self.logger.info("Received interrupt signal, shutting down...")
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}", exc_info=True)
        finally:
            self.shutdown()
    
    def handle_not_paired(self):
        """Handle NOT_PAIRED state - show pairing code"""
        self.logger.info("Device not paired - displaying pairing code")
        
        # Get or generate pairing code
        pairing_code = self.config.get('pairing_code')
        if not pairing_code:
            pairing_code = self.api.generate_pairing_code()
            if pairing_code:
                self.config['pairing_code'] = pairing_code
                self.save_config()
        
        if pairing_code:
            # Display pairing code on screen
            self.display.show_pairing_code(pairing_code)
            
            # Check if device has been paired
            for _ in range(6):  # Check for 60 seconds
                if self.api.check_pairing_status(pairing_code):
                    self.logger.info("Device paired successfully!")
                    device_info = self.api.get_device_info()
                    if device_info:
                        device_id = device_info.get('device_id') or self.api.device_id
                        screen_id = device_info.get('screen_id')
                        
                        if device_id:
                            # Save device info - screen_id might be assigned later by admin
                            self.config['device_id'] = device_id
                            self.config['screen_id'] = screen_id  # May be None initially
                            self.config['location_id'] = device_info.get('location_id')
                            self.config['organization_id'] = device_info.get('organization_id')
                            self.config['pairing_code'] = None  # Clear pairing code
                            self.save_config()
                            
                            if screen_id:
                                self.logger.info(f"Saved pairing info - Device: {device_id}, Screen: {screen_id}")
                            else:
                                self.logger.info(f"Device paired ({device_id}) but no screen assigned yet")
                            return  # State will change on next loop
                        else:
                            self.logger.error(f"No device_id received: {device_info}")
                    else:
                        self.logger.error("Failed to get device info after pairing")
                
                time.sleep(10)
        else:
            self.logger.error("Failed to generate pairing code")
            self.display.show_error("Failed to generate pairing code")
            time.sleep(30)
    
    def handle_waiting_for_media(self):
        """Handle WAITING_FOR_MEDIA state"""
        screen_id = self.config.get('screen_id')
        
        if not screen_id:
            self.logger.info("Device paired but no screen assigned yet")
            # Show waiting for assignment message
            self.display.show_waiting_for_media()
            time.sleep(30)  # Check again in 30 seconds for screen assignment
            return
        
        self.logger.info("Device paired but no content available")
        
        # Show waiting message
        self.display.show_waiting_for_media()
        
        # Check for available content
        content_available = self.content.sync_content()
        if content_available:
            self.logger.info("Content now available")
            return  # State will change on next loop
        
        time.sleep(30)  # Check again in 30 seconds
    
    def handle_playing_content(self):
        """Handle PLAYING_CONTENT state"""
        self.logger.info("Playing scheduled content")
        
        # Periodically sync content to detect playlist changes
        # Only sync every 5th content item to avoid too frequent API calls
        if not hasattr(self, '_content_sync_counter'):
            self._content_sync_counter = 0
        
        self._content_sync_counter += 1
        if self._content_sync_counter >= 5:
            self.logger.info("Checking for content updates...")
            self.content.sync_content()
            self._content_sync_counter = 0
        
        # Get current content to display
        current_content = self.content.get_current_content()
        
        if current_content:
            # Get the duration for this content item
            duration = current_content.get('duration', 10)
            content_type = current_content.get('type', 'image')
            filename = current_content.get('filename', 'unknown')
            
            self.logger.info(f"Displaying content for {duration} seconds: {filename}")
            
            if content_type == 'video':
                # For videos, use a blocking video player that handles timing
                self._play_video_blocking(current_content, duration)
            else:
                # For images, display and wait
                self.display.show_content(current_content)
                time.sleep(duration)
        else:
            self.logger.warning("No content to display, switching to waiting state")
            # State manager will handle this transition
            time.sleep(10)
    
    def _play_video_blocking(self, content_info, duration):
        """Play video for specified duration with proper cleanup"""
        import subprocess
        
        video_path = content_info.get('path')
        filename = content_info.get('filename', 'unknown')
        
        self.logger.info(f"Playing video with blocking: {filename}")
        
        try:
            # Kill any existing video processes
            subprocess.run(['sudo', 'pkill', '-f', 'omxplayer'], capture_output=True)
            subprocess.run(['sudo', 'pkill', '-f', 'vlc'], capture_output=True)
            
            # Start video player and wait for specified duration
            if self._command_exists('omxplayer'):
                cmd = [
                    'omxplayer',
                    '--no-osd',
                    '--blank',
                    '--aspect-mode', 'fill',
                    '--no-keys',
                    video_path
                ]
                self.logger.info("Starting omxplayer for video")
                process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                # Wait for the specified duration
                time.sleep(duration)
                
                # Kill the video player
                try:
                    process.terminate()
                    process.wait(timeout=3)
                except:
                    process.kill()
                
                # Clear screen after video
                self.logger.info("Clearing screen after video")
                subprocess.run(['sudo', 'pkill', '-f', 'omxplayer'], capture_output=True)
                subprocess.run([
                    'sudo', 'dd', 'if=/dev/zero', 'of=/dev/fb0', 
                    'bs=1M', 'count=1'
                ], capture_output=True, timeout=5)
                
                self.logger.info("Video playback completed and screen cleared")
                
            else:
                self.logger.error("omxplayer not available for video playback")
                # Fallback to regular display
                self.display.show_content(content_info)
                time.sleep(duration)
                
        except Exception as e:
            self.logger.error(f"Error in video playback: {e}")
            # Fallback to regular display
            self.display.show_content(content_info)
            time.sleep(duration)
    
    def _command_exists(self, command):
        """Check if command exists in system PATH"""
        import subprocess
        try:
            subprocess.run(['which', command], check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError:
            return False
    
    def shutdown(self):
        """Clean shutdown"""
        self.logger.info("Shutting down Pi client...")
        self.running = False
        self.display.cleanup()

def main():
    parser = argparse.ArgumentParser(description='Mesophy Pi Client')
    parser.add_argument('--config', default='/opt/mesophy/config/client.conf',
                        help='Configuration file path')
    parser.add_argument('--daemon', action='store_true',
                        help='Run as daemon')
    
    args = parser.parse_args()
    
    client = MesophyPiClient(args.config)
    
    if args.daemon:
        # TODO: Implement proper daemonization
        pass
    
    client.run()

if __name__ == "__main__":
    main()