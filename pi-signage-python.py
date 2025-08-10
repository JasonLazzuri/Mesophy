#!/usr/bin/env python3

"""
pi-signage-python.py - Enhanced Python Digital Signage Player
A pygame-based fallback solution for Raspberry Pi digital signage
when native shell script approach needs more control or compatibility.
"""

import pygame
import requests
import json
import time
import os
import sys
import threading
import logging
import subprocess
import signal
from urllib.parse import urlparse, unquote
from pathlib import Path
from typing import List, Dict, Optional
import tempfile

# Configuration
API_URL = "https://mesophy.vercel.app/api/screens/d732c7ac-076d-471c-b656-f40f8d1857e5/current-content"
SLIDE_DURATION = 10  # seconds
REFRESH_INTERVAL = 30  # seconds
CACHE_DIR = Path("/tmp/pi-signage-python")
LOG_FILE = "/tmp/pi-signage-python.log"
FULLSCREEN = True
FPS = 60

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class MediaAsset:
    """Represents a single media asset (image or video)"""
    
    def __init__(self, data: Dict):
        self.name = data.get('name', 'Unknown')
        self.url = data.get('optimized_url') or data.get('file_url')
        self.media_type = data.get('media_type', 'image')
        self.mime_type = data.get('mime_type', 'image/jpeg')
        self.duration = data.get('duration', SLIDE_DURATION)
        self.local_path: Optional[Path] = None
        self.is_downloaded = False
    
    def get_filename(self) -> str:
        """Generate a safe filename for local storage"""
        if self.url:
            parsed_url = urlparse(self.url)
            filename = unquote(os.path.basename(parsed_url.path))
            
            if not filename or filename == '/':
                ext = self.mime_type.split('/')[-1] if self.mime_type else 'jpg'
                filename = f"{self.name}.{ext}"
            
            # Sanitize filename
            filename = "".join(c for c in filename if c.isalnum() or c in ".-_")
            return filename
        
        return f"{self.name}.unknown"
    
    def download(self, cache_dir: Path) -> bool:
        """Download the media file to local cache"""
        if not self.url:
            logger.error(f"No URL for media asset: {self.name}")
            return False
        
        try:
            filename = self.get_filename()
            self.local_path = cache_dir / filename
            
            # Skip download if file exists and is recent
            if self.local_path.exists():
                age = time.time() - self.local_path.stat().st_mtime
                if age < 3600:  # 1 hour
                    logger.debug(f"Using cached file: {self.local_path}")
                    self.is_downloaded = True
                    return True
            
            logger.info(f"Downloading: {self.name} -> {filename}")
            
            response = requests.get(self.url, timeout=60, stream=True)
            response.raise_for_status()
            
            with open(self.local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            self.is_downloaded = True
            logger.info(f"Downloaded: {self.local_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error downloading {self.name}: {e}")
            return False

class DigitalSignagePlayer:
    """Main digital signage player using pygame"""
    
    def __init__(self):
        self.running = False
        self.media_assets: List[MediaAsset] = []
        self.current_index = 0
        self.last_refresh = 0
        self.last_slide_change = 0
        self.screen = None
        self.screen_size = (1920, 1080)
        self.clock = None
        self.current_surface = None
        self.video_process = None
        
        # Setup cache directory
        CACHE_DIR.mkdir(exist_ok=True)
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.shutdown()
        sys.exit(0)
    
    def initialize_pygame(self):
        """Initialize pygame display"""
        try:
            pygame.init()
            pygame.mixer.quit()  # Disable audio to save resources
            
            # Set display mode
            if FULLSCREEN:
                self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
            else:
                self.screen = pygame.display.set_mode(self.screen_size)
            
            self.screen_size = self.screen.get_size()
            
            pygame.display.set_caption("Pi Digital Signage")
            pygame.mouse.set_visible(False)
            
            self.clock = pygame.time.Clock()
            
            # Fill screen with black initially
            self.screen.fill((0, 0, 0))
            pygame.display.flip()
            
            logger.info(f"Pygame initialized: {self.screen_size}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize pygame: {e}")
            return False
    
    def fetch_content(self) -> bool:
        """Fetch content from API"""
        try:
            logger.info("Fetching content from API...")
            
            response = requests.get(API_URL, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Parse media assets
            new_assets = []
            for asset_data in data.get('media_assets', []):
                asset = MediaAsset(asset_data)
                new_assets.append(asset)
            
            if new_assets:
                self.media_assets = new_assets
                logger.info(f"Loaded {len(self.media_assets)} media assets")
                
                # Download media files in background thread
                threading.Thread(target=self._download_media, daemon=True).start()
                return True
            else:
                logger.warning("No media assets found in API response")
                return False
                
        except requests.RequestException as e:
            logger.error(f"API request failed: {e}")
            return False
        except Exception as e:
            logger.error(f"Error fetching content: {e}")
            return False
    
    def _download_media(self):
        """Download all media files"""
        for asset in self.media_assets:
            if not asset.download(CACHE_DIR):
                logger.warning(f"Failed to download: {asset.name}")
    
    def load_image(self, asset: MediaAsset) -> Optional[pygame.Surface]:
        """Load and scale image for display"""
        if not asset.local_path or not asset.local_path.exists():
            logger.error(f"Image file not found: {asset.local_path}")
            return None
        
        try:
            image = pygame.image.load(str(asset.local_path))
            
            # Scale image to fit screen while maintaining aspect ratio
            image_rect = image.get_rect()
            screen_rect = pygame.Rect(0, 0, *self.screen_size)
            
            # Calculate scaling factor
            scale_x = screen_rect.width / image_rect.width
            scale_y = screen_rect.height / image_rect.height
            scale = min(scale_x, scale_y)
            
            new_width = int(image_rect.width * scale)
            new_height = int(image_rect.height * scale)
            
            scaled_image = pygame.transform.scale(image, (new_width, new_height))
            
            # Create surface with black background
            surface = pygame.Surface(self.screen_size)
            surface.fill((0, 0, 0))
            
            # Center the image
            x = (self.screen_size[0] - new_width) // 2
            y = (self.screen_size[1] - new_height) // 2
            surface.blit(scaled_image, (x, y))
            
            return surface
            
        except Exception as e:
            logger.error(f"Error loading image {asset.name}: {e}")
            return None
    
    def play_video(self, asset: MediaAsset):
        """Play video using external player"""
        if not asset.local_path or not asset.local_path.exists():
            logger.error(f"Video file not found: {asset.local_path}")
            return
        
        try:
            # Stop any existing video
            self.stop_video()
            
            # Determine video duration
            duration = min(asset.duration, SLIDE_DURATION) if isinstance(asset.duration, (int, float)) and asset.duration > 0 else SLIDE_DURATION
            
            # Use VLC for video playback
            cmd = [
                'vlc',
                '--intf', 'dummy',
                '--fullscreen',
                '--no-video-title',
                '--quiet',
                '--play-and-exit',
                '--run-time', str(int(duration)),
                str(asset.local_path)
            ]
            
            logger.info(f"Playing video: {asset.name}")
            self.video_process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
        except Exception as e:
            logger.error(f"Error playing video {asset.name}: {e}")
    
    def stop_video(self):
        """Stop currently playing video"""
        if self.video_process:
            try:
                self.video_process.terminate()
                self.video_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.video_process.kill()
            except Exception as e:
                logger.error(f"Error stopping video: {e}")
            finally:
                self.video_process = None
    
    def display_message(self, message: str, color=(255, 255, 255)):
        """Display a text message on screen"""
        try:
            font = pygame.font.Font(None, 48)
            text_surface = font.render(message, True, color)
            
            # Center the text
            text_rect = text_surface.get_rect(center=(self.screen_size[0] // 2, self.screen_size[1] // 2))
            
            self.screen.fill((0, 0, 0))
            self.screen.blit(text_surface, text_rect)
            pygame.display.flip()
            
        except Exception as e:
            logger.error(f"Error displaying message: {e}")
    
    def handle_slideshow(self):
        """Handle slideshow logic"""
        current_time = time.time()
        
        # Check if we need to refresh content
        if current_time - self.last_refresh > REFRESH_INTERVAL:
            if self.fetch_content():
                self.last_refresh = current_time
                self.current_index = 0  # Reset to first slide
        
        # Check if we need to change slides
        if not self.media_assets:
            self.display_message("No content available\nFetching from server...")
            return
        
        if current_time - self.last_slide_change > SLIDE_DURATION:
            self.show_next_slide()
            self.last_slide_change = current_time
    
    def show_next_slide(self):
        """Display the next slide in the sequence"""
        if not self.media_assets:
            return
        
        asset = self.media_assets[self.current_index]
        logger.info(f"Showing slide {self.current_index + 1}/{len(self.media_assets)}: {asset.name}")
        
        if asset.media_type == 'video':
            self.play_video(asset)
            # Clear pygame screen during video
            self.screen.fill((0, 0, 0))
            pygame.display.flip()
        else:
            # Stop any playing video first
            self.stop_video()
            
            # Load and display image
            if asset.is_downloaded:
                image_surface = self.load_image(asset)
                if image_surface:
                    self.screen.blit(image_surface, (0, 0))
                    pygame.display.flip()
                else:
                    self.display_message(f"Error loading:\n{asset.name}", color=(255, 100, 100))
            else:
                self.display_message(f"Downloading:\n{asset.name}", color=(255, 255, 100))
        
        # Advance to next slide
        self.current_index = (self.current_index + 1) % len(self.media_assets)
    
    def run(self):
        """Main game loop"""
        logger.info("Starting Pi Digital Signage Player")
        
        if not self.initialize_pygame():
            logger.error("Failed to initialize pygame")
            return False
        
        self.running = True
        
        # Initial content fetch
        self.display_message("Loading content...", color=(100, 255, 100))
        if not self.fetch_content():
            logger.error("Failed to fetch initial content")
            self.display_message("Failed to load content\nCheck network connection", color=(255, 100, 100))
        
        self.last_refresh = time.time()
        self.last_slide_change = time.time()
        
        # Main loop
        while self.running:
            try:
                # Handle pygame events
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        self.running = False
                    elif event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
                            self.running = False
                        elif event.key == pygame.K_SPACE:
                            # Manual advance to next slide
                            self.show_next_slide()
                            self.last_slide_change = time.time()
                        elif event.key == pygame.K_r:
                            # Manual refresh content
                            self.fetch_content()
                
                # Handle slideshow
                self.handle_slideshow()
                
                # Control frame rate
                self.clock.tick(FPS)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(1)  # Prevent rapid error loops
        
        self.shutdown()
        return True
    
    def shutdown(self):
        """Cleanup and shutdown"""
        logger.info("Shutting down...")
        
        self.running = False
        
        # Stop video playback
        self.stop_video()
        
        # Quit pygame
        try:
            pygame.quit()
        except:
            pass
        
        logger.info("Shutdown complete")

def main():
    """Main entry point"""
    import argparse
    
    # Declare global variables first
    global API_URL, SLIDE_DURATION, REFRESH_INTERVAL, CACHE_DIR, FULLSCREEN
    
    parser = argparse.ArgumentParser(description="Pi Digital Signage Python Player")
    parser.add_argument('--api-url', default=API_URL, help='API endpoint URL')
    parser.add_argument('--slide-duration', type=int, default=SLIDE_DURATION, help='Slide duration in seconds')
    parser.add_argument('--refresh-interval', type=int, default=REFRESH_INTERVAL, help='Content refresh interval in seconds')
    parser.add_argument('--cache-dir', default=str(CACHE_DIR), help='Cache directory path')
    parser.add_argument('--windowed', action='store_true', help='Run in windowed mode instead of fullscreen')
    parser.add_argument('--test', action='store_true', help='Test API connectivity and exit')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    
    args = parser.parse_args()
    
    # Update global configuration
    API_URL = args.api_url
    SLIDE_DURATION = args.slide_duration
    REFRESH_INTERVAL = args.refresh_interval
    CACHE_DIR = Path(args.cache_dir)
    FULLSCREEN = not args.windowed
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Test mode
    if args.test:
        print(f"Testing API connectivity to: {API_URL}")
        try:
            response = requests.get(API_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            print(f"✅ API connection successful")
            print(f"Schedule: {data.get('schedule_name', 'Unknown')}")
            print(f"Screen: {data.get('screen_name', 'Unknown')}")
            print(f"Media assets: {len(data.get('media_assets', []))}")
            
            for i, asset in enumerate(data.get('media_assets', [])[:3]):
                print(f"  {i+1}. {asset.get('name')} ({asset.get('media_type')})")
            
            return 0
            
        except Exception as e:
            print(f"❌ API test failed: {e}")
            return 1
    
    # Run the player
    player = DigitalSignagePlayer()
    
    try:
        success = player.run()
        return 0 if success else 1
        
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 0
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())