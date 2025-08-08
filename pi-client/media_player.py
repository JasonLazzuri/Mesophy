#!/usr/bin/env python3
"""
Mesophy Pi Client - Native Media Player
Hardware-accelerated media playback using Pi native tools
"""

import os
import json
import time
import subprocess
import threading
import queue
from pathlib import Path
from PIL import Image

class NativeMediaPlayer:
    def __init__(self, content_dir='/opt/mesophy/content', config_path='/opt/mesophy/config/config.json'):
        self.content_dir = Path(content_dir)
        self.config_path = config_path
        self.config = self.load_config()
        
        # Display settings
        self.display_width = self.config.get('display', {}).get('width', 1920)
        self.display_height = self.config.get('display', {}).get('height', 1080)
        
        # Media player processes
        self.current_process = None
        self.playlist_queue = queue.Queue()
        self.playback_thread = None
        self.is_playing = False
        
        # Supported formats
        self.video_formats = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
        self.image_formats = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
        
        # Create content directory
        self.content_dir.mkdir(parents=True, exist_ok=True)
        
        print("Native Media Player initialized")

    def load_config(self):
        """Load configuration"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"Error loading config: {e}")
            return {}

    def stop_current_playback(self):
        """Stop any currently playing media"""
        if self.current_process:
            try:
                self.current_process.terminate()
                self.current_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.current_process.kill()
                self.current_process.wait()
            except:
                pass
            finally:
                self.current_process = None

    def play_video(self, video_path, duration=None):
        """Play video using omxplayer with hardware acceleration"""
        print(f"Playing video: {video_path}")
        
        self.stop_current_playback()
        
        try:
            cmd = [
                'omxplayer',
                '--no-keys',           # Disable keyboard input
                '--no-osd',            # Disable on-screen display
                '--blank',             # Blank screen before playing
                '--aspect-mode', 'fill', # Fill screen
                str(video_path)
            ]
            
            # Add loop option if no duration specified
            if duration is None:
                cmd.insert(-1, '--loop')
            
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # If duration specified, wait and then stop
            if duration:
                time.sleep(duration)
                self.stop_current_playback()
            
        except FileNotFoundError:
            print("omxplayer not found, trying VLC as fallback")
            self.play_video_vlc(video_path, duration)
        except Exception as e:
            print(f"Error playing video: {e}")

    def play_video_vlc(self, video_path, duration=None):
        """Fallback video player using VLC"""
        try:
            cmd = [
                'vlc',
                '--intf', 'dummy',
                '--no-video-title-show',
                '--fullscreen',
                '--no-mouse-events',
                '--no-keyboard-events',
                str(video_path)
            ]
            
            if duration is None:
                cmd.extend(['--loop'])
            
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            if duration:
                time.sleep(duration)
                self.stop_current_playback()
                
        except Exception as e:
            print(f"Error playing video with VLC: {e}")

    def play_image(self, image_path, duration=10):
        """Display image using fbi"""
        print(f"Displaying image: {image_path} for {duration}s")
        
        self.stop_current_playback()
        
        try:
            # Resize image if needed
            resized_path = self.resize_image_if_needed(image_path)
            
            cmd = [
                'fbi',
                '-d', '/dev/fb0',
                '-T', '1',
                '-noverbose',
                '-a',  # autozoom
                str(resized_path)
            ]
            
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # Display for specified duration
            time.sleep(duration)
            self.stop_current_playback()
            
        except Exception as e:
            print(f"Error displaying image: {e}")

    def resize_image_if_needed(self, image_path):
        """Resize image if it's too large for optimal display"""
        try:
            # Check if image is already reasonable size
            with Image.open(image_path) as img:
                width, height = img.size
                
                # If image is already reasonable size, return original
                if width <= self.display_width * 1.2 and height <= self.display_height * 1.2:
                    return image_path
                
                # Create resized version
                resized_dir = self.content_dir / 'resized'
                resized_dir.mkdir(exist_ok=True)
                
                resized_path = resized_dir / f"resized_{Path(image_path).name}"
                
                # Don't resize if already exists and is newer
                if (resized_path.exists() and 
                    resized_path.stat().st_mtime > Path(image_path).stat().st_mtime):
                    return resized_path
                
                # Resize maintaining aspect ratio
                img.thumbnail((self.display_width, self.display_height), Image.Resampling.LANCZOS)
                img.save(resized_path, optimize=True, quality=85)
                
                print(f"Resized {image_path} -> {resized_path}")
                return resized_path
                
        except Exception as e:
            print(f"Error resizing image: {e}")
            return image_path  # Return original on error

    def load_playlist(self, playlist_data):
        """Load playlist into queue"""
        print(f"Loading playlist with {len(playlist_data.get('items', []))} items")
        
        # Clear existing queue
        while not self.playlist_queue.empty():
            try:
                self.playlist_queue.get_nowait()
            except:
                break
        
        # Add items to queue
        for item in playlist_data.get('items', []):
            media_info = item.get('media_asset')
            if media_info:
                media_item = {
                    'name': media_info.get('name', 'Unknown'),
                    'url': media_info.get('url'),
                    'mime_type': media_info.get('mime_type'),
                    'duration': item.get('duration', 10),  # Default 10s for images
                    'local_path': None
                }
                self.playlist_queue.put(media_item)
        
        print(f"Playlist loaded with {self.playlist_queue.qsize()} items")

    def download_media_item(self, media_item):
        """Download media item to local storage"""
        if not media_item['url']:
            return None
            
        try:
            import requests
            
            # Create filename from URL
            filename = Path(media_item['url']).name
            if not filename or '.' not in filename:
                # Generate filename from name and mime_type
                ext = self.get_extension_from_mime(media_item['mime_type'])
                safe_name = "".join(c for c in media_item['name'] if c.isalnum() or c in (' ', '-', '_')).strip()
                filename = f"{safe_name}{ext}"
            
            local_path = self.content_dir / filename
            
            # Skip download if file exists and is recent
            if local_path.exists() and time.time() - local_path.stat().st_mtime < 3600:
                media_item['local_path'] = local_path
                return local_path
            
            print(f"Downloading {media_item['name']}...")
            
            response = requests.get(media_item['url'], timeout=30)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                f.write(response.content)
            
            media_item['local_path'] = local_path
            print(f"Downloaded: {local_path}")
            return local_path
            
        except Exception as e:
            print(f"Error downloading {media_item['name']}: {e}")
            return None

    def get_extension_from_mime(self, mime_type):
        """Get file extension from MIME type"""
        mime_map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov'
        }
        return mime_map.get(mime_type, '.bin')

    def play_media_item(self, media_item):
        """Play a single media item"""
        if not media_item['local_path'] or not os.path.exists(media_item['local_path']):
            print(f"Media file not found: {media_item['name']}")
            return
        
        file_ext = Path(media_item['local_path']).suffix.lower()
        
        if file_ext in self.video_formats:
            duration = media_item.get('duration')
            # For videos, if duration is specified and > 0, use it, otherwise loop indefinitely
            if duration and duration > 0:
                self.play_video(media_item['local_path'], duration)
            else:
                self.play_video(media_item['local_path'])  # Loop indefinitely
        elif file_ext in self.image_formats:
            duration = media_item.get('duration', 10)  # Default 10s for images
            self.play_image(media_item['local_path'], max(duration, 1))  # Min 1s
        else:
            print(f"Unsupported media format: {file_ext}")

    def start_playlist_playback(self):
        """Start playlist playback loop"""
        if self.is_playing:
            return
        
        def playback_worker():
            print("Starting playlist playback")
            self.is_playing = True
            
            while self.is_playing:
                if self.playlist_queue.empty():
                    print("Playlist empty, waiting...")
                    time.sleep(10)
                    continue
                
                try:
                    # Get next item (this will block if queue is empty)
                    media_item = self.playlist_queue.get(timeout=1)
                    
                    # Download if needed
                    if not media_item['local_path']:
                        local_path = self.download_media_item(media_item)
                        if not local_path:
                            continue
                    
                    # Play the media
                    self.play_media_item(media_item)
                    
                    # Add item back to end of queue for looping
                    self.playlist_queue.put(media_item)
                    
                except queue.Empty:
                    continue
                except Exception as e:
                    print(f"Error in playback loop: {e}")
                    time.sleep(5)
            
            print("Playlist playback stopped")
        
        self.playback_thread = threading.Thread(target=playback_worker, daemon=True)
        self.playback_thread.start()

    def stop_playlist_playback(self):
        """Stop playlist playback"""
        print("Stopping playlist playback")
        self.is_playing = False
        self.stop_current_playback()
        
        if self.playback_thread:
            self.playback_thread.join(timeout=5)

    def show_test_pattern(self):
        """Show a test pattern for debugging"""
        print("Showing test pattern")
        
        # Create simple test pattern
        from PIL import Image, ImageDraw, ImageFont
        
        img = Image.new('RGB', (self.display_width, self.display_height), color='black')
        draw = ImageDraw.Draw(img)
        
        # Draw test pattern
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255), (0, 255, 255)]
        bar_width = self.display_width // len(colors)
        
        for i, color in enumerate(colors):
            x1 = i * bar_width
            x2 = (i + 1) * bar_width
            draw.rectangle([x1, 0, x2, self.display_height//2], fill=color)
        
        # Draw text
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 60)
        except:
            font = ImageFont.load_default()
        
        text = "MESOPHY TEST PATTERN"
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        draw.text(((self.display_width - text_width) // 2, self.display_height // 2 + 50), 
                 text, fill=(255, 255, 255), font=font)
        
        # Save and display
        test_path = self.content_dir / 'test_pattern.png'
        img.save(test_path)
        
        self.play_image(test_path, 30)  # Show for 30 seconds

    def cleanup(self):
        """Clean up resources"""
        print("Cleaning up media player...")
        self.stop_playlist_playback()


# Example usage
if __name__ == "__main__":
    player = NativeMediaPlayer()
    
    # Show test pattern
    player.show_test_pattern()
    
    # Example playlist playback
    # playlist = {
    #     'items': [
    #         {
    #             'media_asset': {
    #                 'name': 'Sample Image',
    #                 'url': 'https://example.com/image.jpg',
    #                 'mime_type': 'image/jpeg'
    #             },
    #             'duration': 10
    #         }
    #     ]
    # }
    # 
    # player.load_playlist(playlist)
    # player.start_playlist_playback()
    # 
    # try:
    #     while True:
    #         time.sleep(10)
    # except KeyboardInterrupt:
    #     player.cleanup()