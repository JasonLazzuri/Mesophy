"""
Content Manager for Mesophy Pi Client
Handles media download, caching, and scheduling
"""

import os
import json
import logging
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

class ContentManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.cache_dir = config.get('cache_dir', '/opt/mesophy/content')
        self.max_cache_size_mb = 1000  # 1GB cache limit
        
        # Create cache directory
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # Content cache info
        self.cache_info_file = os.path.join(self.cache_dir, 'cache_info.json')
        self.cache_info = self._load_cache_info()
        
        # Current playlist
        self.current_playlist = []
        self.current_index = 0
    
    def sync_content(self):
        """Sync content from API and return True if content is available"""
        screen_id = self.config.get('screen_id')
        if not screen_id:
            return False
        
        try:
            from api_client import APIClient
            api = APIClient(self.config)
            
            # Get current media list
            media_list = api.get_media_list(screen_id)
            
            if not media_list:
                self.logger.info("No media content available")
                return False
            
            # Download missing media
            downloaded_any = False
            for media_item in media_list:
                if self._download_media_item(media_item, api):
                    downloaded_any = True
            
            # Update playlist
            self.current_playlist = self._build_playlist(media_list)
            
            # Clean up old cache files
            self._cleanup_cache()
            
            return len(self.current_playlist) > 0
            
        except Exception as e:
            self.logger.error(f"Error syncing content: {e}")
            return False
    
    def get_current_content(self):
        """Get current content item to display"""
        if not self.current_playlist:
            return None
        
        if self.current_index >= len(self.current_playlist):
            self.current_index = 0
        
        content_item = self.current_playlist[self.current_index]
        
        # Move to next item for next call
        self.current_index += 1
        
        return content_item
    
    def _download_media_item(self, media_item, api):
        """Download a single media item if not already cached"""
        try:
            media_id = media_item.get('id')
            media_url = media_item.get('url')
            media_type = media_item.get('type', 'image')
            filename = media_item.get('filename', f"media_{media_id}")
            
            # Create local filename
            local_filename = f"{media_id}_{self._sanitize_filename(filename)}"
            local_path = os.path.join(self.cache_dir, local_filename)
            
            # Check if already cached and up to date
            if self._is_cached_and_current(media_item, local_path):
                self.logger.debug(f"Media already cached: {local_filename}")
                return False
            
            # Download the media
            self.logger.info(f"Downloading media: {local_filename}")
            
            if api.download_media(media_url, local_path):
                # Update cache info
                self.cache_info[str(media_id)] = {
                    'local_path': local_path,
                    'filename': local_filename,
                    'type': media_type,
                    'size': os.path.getsize(local_path),
                    'downloaded_at': datetime.utcnow().isoformat(),
                    'url_hash': hashlib.md5(media_url.encode()).hexdigest()
                }
                
                self._save_cache_info()
                return True
            else:
                self.logger.error(f"Failed to download: {local_filename}")
                return False
                
        except Exception as e:
            self.logger.error(f"Error downloading media item: {e}")
            return False
    
    def _build_playlist(self, media_list):
        """Build playlist from media list"""
        playlist = []
        
        for media_item in media_list:
            media_id = str(media_item.get('id'))
            cache_item = self.cache_info.get(media_id)
            
            if cache_item and os.path.exists(cache_item['local_path']):
                # Use the current media_item type (which may have been corrected by API client)
                # instead of the cached type (which might be wrong)
                current_type = media_item.get('type', cache_item['type'])
                
                # Update cache if type has been corrected
                if current_type != cache_item['type']:
                    self.logger.info(f"Updating cached type for {media_id}: {cache_item['type']} → {current_type}")
                    cache_item['type'] = current_type
                    self.cache_info[media_id] = cache_item
                    self._save_cache_info()
                
                playlist.append({
                    'id': media_id,
                    'path': cache_item['local_path'],
                    'type': current_type,
                    'filename': cache_item['filename'],
                    'duration': media_item.get('duration', 10)  # Default 10 seconds
                })
        
        self.logger.info(f"Built playlist with {len(playlist)} items")
        return playlist
    
    def _is_cached_and_current(self, media_item, local_path):
        """Check if media is already cached and current"""
        media_id = str(media_item.get('id'))
        media_url = media_item.get('url', '')
        
        # Check if file exists
        if not os.path.exists(local_path):
            return False
        
        # Check cache info
        cache_item = self.cache_info.get(media_id)
        if not cache_item:
            return False
        
        # Check if URL has changed (simple hash check)
        url_hash = hashlib.md5(media_url.encode()).hexdigest()
        if cache_item.get('url_hash') != url_hash:
            return False
        
        # Check file integrity
        if not os.path.exists(cache_item['local_path']):
            return False
        
        return True
    
    def _load_cache_info(self):
        """Load cache information from disk"""
        try:
            if os.path.exists(self.cache_info_file):
                with open(self.cache_info_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            self.logger.error(f"Error loading cache info: {e}")
        
        return {}
    
    def _save_cache_info(self):
        """Save cache information to disk"""
        try:
            with open(self.cache_info_file, 'w') as f:
                json.dump(self.cache_info, f, indent=2)
        except Exception as e:
            self.logger.error(f"Error saving cache info: {e}")
    
    def _cleanup_cache(self):
        """Clean up old cache files to stay within size limit"""
        try:
            # Calculate current cache size
            total_size = 0
            cache_items = []
            
            for media_id, cache_item in self.cache_info.items():
                local_path = cache_item.get('local_path', '')
                if os.path.exists(local_path):
                    size = os.path.getsize(local_path)
                    total_size += size
                    cache_items.append((media_id, cache_item, size))
            
            # Convert MB to bytes
            max_size_bytes = self.max_cache_size_mb * 1024 * 1024
            
            if total_size > max_size_bytes:
                self.logger.info(f"Cache size ({total_size / 1024 / 1024:.1f}MB) exceeds limit, cleaning up...")
                
                # Sort by download date (oldest first)
                cache_items.sort(key=lambda x: x[1].get('downloaded_at', ''))
                
                # Remove oldest files until under limit
                for media_id, cache_item, size in cache_items:
                    if total_size <= max_size_bytes:
                        break
                    
                    local_path = cache_item['local_path']
                    try:
                        os.remove(local_path)
                        del self.cache_info[media_id]
                        total_size -= size
                        self.logger.info(f"Removed cached file: {local_path}")
                    except Exception as e:
                        self.logger.error(f"Error removing cached file: {e}")
                
                self._save_cache_info()
        
        except Exception as e:
            self.logger.error(f"Error during cache cleanup: {e}")
    
    def _sanitize_filename(self, filename):
        """Sanitize filename for safe storage"""
        # Remove or replace unsafe characters
        unsafe_chars = '<>:"/\\|?*'
        for char in unsafe_chars:
            filename = filename.replace(char, '_')
        
        # Limit length
        if len(filename) > 100:
            name, ext = os.path.splitext(filename)
            filename = name[:90] + ext
        
        return filename
    
    def get_cache_stats(self):
        """Get cache statistics"""
        try:
            total_files = len(self.cache_info)
            total_size = 0
            
            for cache_item in self.cache_info.values():
                local_path = cache_item.get('local_path', '')
                if os.path.exists(local_path):
                    total_size += os.path.getsize(local_path)
            
            return {
                'total_files': total_files,
                'total_size_mb': total_size / 1024 / 1024,
                'cache_dir': self.cache_dir
            }
        
        except Exception as e:
            self.logger.error(f"Error getting cache stats: {e}")
            return {'total_files': 0, 'total_size_mb': 0, 'cache_dir': self.cache_dir}